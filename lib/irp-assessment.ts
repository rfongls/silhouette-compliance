import { EntKind } from "@prisma/client";
import { NextResponse } from "next/server";
import { runGapAnalysis, demoAssessment } from "@/lib/analysis/engine";
import { IRP_PROMPT_VERSION } from "@/lib/analysis/prompts";
import { IRP_CONTROL_BATCH_SIZE, SCORING_POLICY_VERSION, scoringPassCount } from "@/lib/analysis/scoring";
import { profileIrpControls } from "@/lib/analysis/scoring-profile";
import { normalizeStandards } from "@/lib/analysis/standards";
import { requireSession } from "@/lib/authz";
import { loadPublishedControlSet } from "@/lib/control-boards";
import { assessmentFingerprint, documentSetIntegrity, groupDocumentsByOrg, quoteSourceDigest, type IntegrityDocument } from "@/lib/document-integrity";
import { consumeEntitlementTx, PaymentRequiredError, restoreEntitlement } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";
import { estimateRunQuote, normalizeOrgNames } from "@/lib/run-quotes";
import { getAIConfig } from "@/lib/settings";
import { centsForKind } from "@/lib/stripe";
import { isEffectiveAdmin } from "@/lib/view-role";
import { buildNetworkReport } from "@/lib/network-report";
import { providerFailureEvidence } from "@/lib/analysis/anthropic";
import { assessmentFailureReason } from "@/lib/assessment-failure";

function organizationKey(name: string) {
  return name.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "organization";
}

class QuoteAlreadyClaimedError extends Error {}

function dataHandlingAttestation() {
  return {
    status: "UPLOADER_ATTESTED_NO_KNOWN_PHI",
    message: "The uploader attested that they reviewed the submitted files and removed PHI. Silhouette did not inspect, classify, or certify the uploads for PHI.",
    affects_score: false
  };
}

async function consumedQuoteResponse(quote: any, accountId: string) {
  if (quote.reportDeletedAt) {
    return NextResponse.json({ error: "This report package was deleted. Prepare a new assessment to run it again." }, { status: 410 });
  }

  const reportAssessmentIds: string[] = Array.isArray(quote.reportAssessmentIds)
    ? quote.reportAssessmentIds.map((value: unknown) => String(value)).filter(Boolean)
    : [];
  if (reportAssessmentIds.length) {
    const stored = await prisma.assessment.findMany({
      where: {
        id: { in: reportAssessmentIds },
        accountId,
        status: "DELIVERED"
      },
      select: { id: true, orgName: true, result: true }
    });
    const byId = new Map(stored.map((assessment) => [assessment.id, assessment]));
    const assessments = reportAssessmentIds
      .map((id) => byId.get(id))
      .filter((assessment): assessment is NonNullable<typeof assessment> => Boolean(assessment?.result))
      .map((assessment) => ({
        assessmentId: assessment.id,
        orgName: assessment.orgName || "Organization",
        result: assessment.result,
        reused: true
      }));
    if (assessments.length) {
      return NextResponse.json({
        assessments,
        networkReport: quote.networkResult || null,
        quoteId: quote.id,
        assessmentId: assessments[0].assessmentId,
        result: assessments[0].result,
        reused: true
      });
    }
  }

  const linked = await prisma.assessment.findMany({
    where: {
      accountId,
      ledger: { is: { quoteId: quote.id } }
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      orgName: true,
      status: true,
      progressStage: true,
      progressMessage: true,
      progressCurrent: true,
      progressTotal: true,
      progressUpdatedAt: true,
      createdAt: true,
      updatedAt: true
    }
  });
  if (linked.some((assessment) => assessment.status === "RUNNING" || assessment.status === "PENDING")) {
    return NextResponse.json({
      processing: true,
      quoteId: quote.id,
      assessments: linked.map((assessment) => ({ ...assessment, quoteId: quote.id }))
    }, { status: 202 });
  }

  return NextResponse.json({
    error: linked.length
      ? "The previous assessment attempt did not complete. Prepare a new run to continue."
      : "This run authorization was already used. Open report history or prepare a new run."
  }, { status: 409 });
}

export async function handleIrpAssessment(req: Request) {
  const guard = await requireSession("customer");
  if ("response" in guard) return guard.response;
  const body = await req.json().catch(() => ({}));
  if (body.demo === true) return NextResponse.json({ result: demoAssessment(body.orgName, body.industry) });
  if (body.phiAttested !== true) {
    return NextResponse.json({ error: "Confirm that the uploader reviewed the files and removed PHI before running the assessment." }, { status: 400 });
  }

  const orgNames = normalizeOrgNames(body.orgNames, body.orgCount);
  const documents: IntegrityDocument[] = Array.isArray(body.documents)
    ? body.documents.map((document: any) => ({
        name: String(document?.name || "document.txt"),
        text: String(document?.text || ""),
        orgName: String(document?.orgName || orgNames[0] || "Organization 1").trim()
      }))
    : [];
  if (!documents.length || documents.every((document) => !document.text.trim())) {
    return NextResponse.json({ error: "At least one document text payload is required." }, { status: 400 });
  }

  let groupedDocuments: Map<string, IntegrityDocument[]>;
  try {
    groupedDocuments = groupDocumentsByOrg(documents, orgNames);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
  for (const [orgName, rows] of groupedDocuments) {
    if (documentSetIntegrity(rows).duplicateHashes.length) {
      return NextResponse.json({ error: `Duplicate file content was submitted more than once for ${orgName}. Remove the duplicate and start the run again.` }, { status: 409 });
    }
  }

  const accountId = guard.session.user.accountId;
  const isAdmin = isEffectiveAdmin(guard.session);
  const assessmentScope = body.assessmentScope === "network" ? "network" : "self";
  const parentOrgName = assessmentScope === "network" ? String(body.parentOrgName || "").trim() : null;
  if (assessmentScope === "network" && !parentOrgName) {
    return NextResponse.json({ error: "Enter the network or parent organization name." }, { status: 400 });
  }
  const industry = String(body.industry || "health-center");
  const standards = normalizeStandards(industry, body.standards, body.allStandards === true);
  const quoteId = typeof body.quoteId === "string" ? body.quoteId : "";
  const quote = quoteId ? await prisma.runQuote.findFirst({
    where: {
      id: quoteId,
      accountId,
      module: "irp"
    }
  }) : null;
  if (!quote) return NextResponse.json({ error: "A current run authorization is required before assessment." }, { status: 428 });
  if (quote.status === "CONSUMED") return consumedQuoteResponse(quote, accountId);
  const allowedStatuses = isAdmin ? ["QUOTED", "CHECKOUT_STARTED", "PAID"] : ["PAID"];
  if (!allowedStatuses.includes(quote.status) || quote.expiresAt <= new Date()) {
    return NextResponse.json({ error: "A current run authorization is required before assessment." }, { status: 428 });
  }
  if (!quote.withinGuard) return NextResponse.json({ error: "Quote exceeds the configured processing guard." }, { status: 413 });
  if (!quote.preflightAt || !quote.preflight) {
    return NextResponse.json({ error: "This run authorization predates the required provider preflight. Prepare the run again before assessment." }, { status: 428 });
  }

  const quotedOrgNames = Array.isArray(quote.orgNames) ? quote.orgNames.map((name) => String(name || "").trim()).filter(Boolean) : [];
  const orgNamesMatch = quotedOrgNames.length === orgNames.length && quotedOrgNames.every((name, index) => name === orgNames[index]);
  const quoteContext = JSON.stringify({ industry, standards: [...standards].sort(), assessmentScope, parentOrgName });
  if (!orgNamesMatch || quote.assessmentScope !== assessmentScope || (quote.parentOrgName || null) !== parentOrgName || quote.sourceDigest !== quoteSourceDigest(documents, quoteContext)) {
    return NextResponse.json({ error: "Uploaded documents, domain, or selected standards changed while preparing the run. Start the run again." }, { status: 409 });
  }

  let controlSet: Awaited<ReturnType<typeof loadPublishedControlSet>>;
  try {
    controlSet = await loadPublishedControlSet(industry, standards);
  } catch (error) {
    return NextResponse.json({ error: `${(error as Error).message}. Fetch, review, and publish every required control board in Admin before running IRP scoring.` }, { status: 409 });
  }

  const maxCharsPerOrg = Math.max(...[...groupedDocuments.values()].map((rows) => rows.reduce((sum, row) => sum + row.text.length, 0)));
  const applicableControlCount = profileIrpControls(controlSet.controls).controls.length;
  const analysisPasses = Math.max(1, Math.ceil(applicableControlCount / IRP_CONTROL_BATCH_SIZE));
  const analysisRequestCount = scoringPassCount(applicableControlCount, maxCharsPerOrg) * orgNames.length;
  const estimate = estimateRunQuote({ module: "irp", orgNames, documents, analysisPasses, analysisRequestCount });
  if (!estimate.withinGuard || estimate.charCount !== quote.charCount) {
    return NextResponse.json({ error: estimate.warning || "The current document set exceeds the processing-cost guard." }, { status: 413 });
  }

  const cached: any[] = [];
  const pending: Array<{ orgName: string; orgId: string; documents: IntegrityDocument[]; integrity: ReturnType<typeof documentSetIntegrity>; assessmentHash: string }> = [];
  for (const orgName of orgNames) {
    const rows = groupedDocuments.get(orgName)!;
    const integrity = documentSetIntegrity(rows);
    const assessmentHash = assessmentFingerprint(integrity.sourceSetHash, controlSet.snapshot, IRP_PROMPT_VERSION, SCORING_POLICY_VERSION);
    const orgId = organizationKey(orgName);
    const prior = await prisma.assessment.findFirst({
      where: { accountId, orgId, sourceSetHash: assessmentHash, status: "DELIVERED" },
      orderBy: { createdAt: "desc" }
    });
    if (prior?.result) cached.push({ assessmentId: prior.id, orgName, result: prior.result, reused: true });
    else pending.push({ orgName, orgId, documents: rows, integrity, assessmentHash });
  }

  if (!pending.length) {
    const networkReport = assessmentScope === "network" ? buildNetworkReport(parentOrgName!, cached) : null;
    const claimed = await prisma.runQuote.updateMany({
      where: { id: quote.id, accountId, module: "irp", status: quote.status },
      data: { status: "CONSUMED", reportAssessmentIds: cached.map((row) => row.assessmentId), networkResult: networkReport || undefined, networkGeneratedAt: networkReport ? new Date() : undefined }
    });
    if (claimed.count !== 1) {
      const current = await prisma.runQuote.findFirst({ where: { id: quote.id, accountId, module: "irp" } });
      if (current?.status === "CONSUMED") return consumedQuoteResponse(current, accountId);
      return NextResponse.json({ error: "This run authorization changed while the assessment was starting. Prepare the run again." }, { status: 409 });
    }
    return NextResponse.json({ assessments: cached, networkReport, quoteId: quote.id, assessmentId: cached[0]?.assessmentId, result: cached[0]?.result, reused: true });
  }

  const aiConfig = await getAIConfig();
  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      const claimed = await tx.runQuote.updateMany({
        where: { id: quote.id, accountId, module: "irp", status: quote.status },
        data: { status: "CONSUMED" }
      });
      if (claimed.count !== 1) throw new QuoteAlreadyClaimedError();
      if (!isAdmin) await consumeEntitlementTx(tx, accountId, EntKind.ASSESSMENT_CREDIT, pending.length);
      return Promise.all(pending.map(async (item) => {
        const ledger = await tx.usageLedger.create({
          data: {
            accountId,
            kind: "assessment",
            status: isAdmin ? "admin_comped" : "processing",
            orgsBilled: 1,
            amountCents: centsForKind(EntKind.ASSESSMENT_CREDIT),
            quoteId: quote.id
          }
        });
        const assessment = await tx.assessment.create({
          data: {
            accountId,
            orgId: item.orgId,
            orgName: item.orgName,
            industry,
            status: "RUNNING",
            ledgerId: ledger.id,
            boardCite: controlSet.cite,
            boardSnapshot: controlSet.snapshot,
            modelProvider: aiConfig.provider,
            modelName: aiConfig.model,
            promptVersion: IRP_PROMPT_VERSION,
            documentCount: item.documents.length,
            sourceCharCount: item.integrity.charCount,
            documentHashes: item.integrity.hashes,
            sourceSetHash: item.assessmentHash,
            phiAttested: true,
            phiAttestedAt: new Date(),
            dataHandlingFlags: [dataHandlingAttestation()],
            progressStage: "QUEUED",
            progressMessage: "Assessment accepted. Preparing the published controls and policy segments.",
            progressCurrent: 0,
            progressTotal: scoringPassCount(applicableControlCount, item.integrity.charCount),
            progressUpdatedAt: new Date()
          }
        });
        return { ...item, assessment, ledger };
      }));
    });
  } catch (error) {
    if (error instanceof QuoteAlreadyClaimedError) {
      const current = await prisma.runQuote.findFirst({ where: { id: quote.id, accountId, module: "irp" } });
      if (current?.status === "CONSUMED") return consumedQuoteResponse(current, accountId);
      return NextResponse.json({ error: "This run authorization changed while the assessment was starting. Prepare the run again." }, { status: 409 });
    }
    if (error instanceof PaymentRequiredError) return NextResponse.json({ error: "Confirmed assessment credit required." }, { status: 402 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not start assessment." }, { status: 500 });
  }

  const delivered = [...cached];
  const failed: Array<{ assessmentId: string; orgName: string; error: string }> = [];
  for (const item of created) {
    try {
      await prisma.assessment.update({
        where: { id: item.assessment.id },
        data: {
          progressStage: "PREPARING",
          progressMessage: "Preparing control batches and policy segments for analysis.",
          progressUpdatedAt: new Date()
        }
      });
      const { result: modelResult, usage } = await runGapAnalysis({
        orgName: item.orgName,
        industry,
        standards,
        documents: item.documents.map(({ name, text }) => ({ name, text })),
        controls: controlSet.controls,
        boardCite: controlSet.cite,
        onProgress: async (progress) => {
          await prisma.assessment.update({
            where: { id: item.assessment.id },
            data: {
              progressStage: "ANALYZING",
              progressMessage: progress.message,
              progressCurrent: progress.completed,
              progressTotal: progress.total,
              progressUpdatedAt: new Date()
            }
          });
        },
        onCheckpoint: async (checkpoint) => {
          await prisma.assessmentPassCheckpoint.upsert({
            where: {
              assessmentId_passKey: {
                assessmentId: item.assessment.id,
                passKey: checkpoint.passKey
              }
            },
            create: {
              assessmentId: item.assessment.id,
              passKey: checkpoint.passKey,
              controlBatch: checkpoint.controlBatch,
              evidenceChunk: checkpoint.evidenceChunk,
              evaluations: checkpoint.evaluations,
              inputTokens: checkpoint.inputTokens,
              outputTokens: checkpoint.outputTokens
            },
            update: {
              evaluations: checkpoint.evaluations,
              inputTokens: checkpoint.inputTokens,
              outputTokens: checkpoint.outputTokens
            }
          });
        }
      });
      await prisma.assessment.update({
        where: { id: item.assessment.id },
        data: {
          progressStage: "FINALIZING",
          progressMessage: "Analysis passes are complete. Calculating scores and assembling the report.",
          progressUpdatedAt: new Date()
        }
      });
      const result = {
        ...modelResult,
        data_handling: dataHandlingAttestation(),
        control_board: {
          citation: controlSet.cite,
          snapshot: controlSet.snapshot,
          prompt_version: IRP_PROMPT_VERSION,
          scoring_policy_version: SCORING_POLICY_VERSION,
          model_provider: aiConfig.provider,
          model_name: aiConfig.model
        }
      };
      const saved = await prisma.assessment.update({
        where: { id: item.assessment.id },
        data: {
          status: "DELIVERED",
          score: result.compliance_score,
          posture: result.overall_posture,
          result,
          progressStage: "DELIVERED",
          progressMessage: "Assessment and report completed.",
          progressUpdatedAt: new Date()
        }
      });
      await prisma.usageLedger.update({
        where: { id: item.ledger.id },
        data: { assessmentId: saved.id, status: isAdmin ? "admin_comped" : "succeeded", inputTokens: usage.inputTokens, outputTokens: usage.outputTokens }
      });
      await prisma.assessmentPassCheckpoint.deleteMany({ where: { assessmentId: saved.id } }).catch(() => undefined);
      delivered.push({ assessmentId: saved.id, orgName: item.orgName, result, reused: false });
    } catch (error) {
      const failure = providerFailureEvidence(error);
      const failureStage = failure?.stage || "result_validation";
      const failureReason = assessmentFailureReason({
        failureProvider: failure?.provider || aiConfig.provider,
        failureHttpStatus: failure?.httpStatus || null,
        failureCode: failure?.code || (error instanceof Error ? error.name : "unknown_error"),
        failureRequestId: failure?.requestId || null,
        failureRetriable: failure?.retriable || false,
        failureAttempts: failure?.attempts || 0,
        failureStage
      });
      console.error("IRP assessment failure", {
        assessmentId: item.assessment.id,
        quoteId: quote.id,
        accountId,
        orgId: item.orgId,
        provider: failure?.provider || aiConfig.provider,
        model: failure?.model || aiConfig.model,
        httpStatus: failure?.httpStatus || null,
        code: failure?.code || (error instanceof Error ? error.name : "unknown_error"),
        requestId: failure?.requestId || null,
        retriable: failure?.retriable || false,
        attempts: failure?.attempts || 0,
        stage: failureStage
      });
      await prisma.assessment.update({
        where: { id: item.assessment.id },
        data: {
          status: isAdmin ? "FAILED" : "REFUNDED",
          progressStage: isAdmin ? "FAILED" : "REFUNDED",
          progressMessage: isAdmin ? failureReason : `${failureReason} The purchased credit was restored.`,
          progressUpdatedAt: new Date(),
          failureProvider: failure?.provider || aiConfig.provider,
          failureModel: failure?.model || aiConfig.model,
          failureHttpStatus: failure?.httpStatus || null,
          failureCode: failure?.code || (error instanceof Error ? error.name.slice(0, 120) : "unknown_error"),
          failureRequestId: failure?.requestId || null,
          failureRetriable: failure?.retriable || false,
          failureAttempts: failure?.attempts || 0,
          failureStage,
          failedAt: new Date()
        }
      }).catch(() => undefined);
      await prisma.usageLedger.update({ where: { id: item.ledger.id }, data: { assessmentId: item.assessment.id, status: isAdmin ? "failed" : "refunded" } }).catch(() => undefined);
      if (!isAdmin) await restoreEntitlement(accountId, EntKind.ASSESSMENT_CREDIT, 1, item.assessment.id).catch(() => undefined);
      failed.push({
        assessmentId: item.assessment.id,
        orgName: item.orgName,
        error: isAdmin ? failureReason : `${failureReason} The purchased credit was restored.`
      });
    }
  }

  if (!delivered.length) {
    return NextResponse.json({ error: failed[0]?.error || "Assessment processing failed. Purchased credits were restored.", failed }, { status: 500 });
  }
  const networkReport = assessmentScope === "network" ? buildNetworkReport(parentOrgName!, delivered) : null;
  await prisma.runQuote.update({
    where: { id: quote.id },
    data: {
      reportAssessmentIds: delivered.map((row) => row.assessmentId),
      networkResult: networkReport || undefined,
      networkGeneratedAt: networkReport ? new Date() : undefined
    }
  });
  return NextResponse.json({ assessments: delivered, networkReport, quoteId: quote.id, failed, assessmentId: delivered[0].assessmentId, result: delivered[0].result });
}
