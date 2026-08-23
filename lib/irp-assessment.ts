import { EntKind } from "@prisma/client";
import { NextResponse } from "next/server";
import { runGapAnalysis, demoAssessment } from "@/lib/analysis/engine";
import { IRP_PROMPT_VERSION } from "@/lib/analysis/prompts";
import { IRP_CONTROL_BATCH_SIZE, SCORING_POLICY_VERSION, scoringPassCount } from "@/lib/analysis/scoring";
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

function organizationKey(name: string) {
  return name.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "organization";
}

function dataHandlingAttestation() {
  return {
    status: "UPLOADER_ATTESTED_NO_KNOWN_PHI",
    message: "The uploader attested that they reviewed the submitted files and removed PHI. Silhouette did not inspect, classify, or certify the uploads for PHI.",
    affects_score: false
  };
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
      module: "irp",
      status: { in: isAdmin ? ["QUOTED", "CHECKOUT_STARTED", "PAID"] : ["PAID"] },
      expiresAt: { gt: new Date() }
    }
  }) : null;
  if (!quote) return NextResponse.json({ error: "A current run authorization is required before assessment." }, { status: 428 });
  if (!quote.withinGuard) return NextResponse.json({ error: "Quote exceeds the configured processing guard." }, { status: 413 });

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
  const analysisPasses = Math.max(1, Math.ceil(controlSet.controls.length / IRP_CONTROL_BATCH_SIZE));
  const analysisRequestCount = scoringPassCount(controlSet.controls.length, maxCharsPerOrg) * orgNames.length;
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
    await prisma.runQuote.update({ where: { id: quote.id }, data: { status: "CONSUMED", networkResult: networkReport || undefined, networkGeneratedAt: networkReport ? new Date() : undefined } });
    return NextResponse.json({ assessments: cached, networkReport, quoteId: quote.id, assessmentId: cached[0]?.assessmentId, result: cached[0]?.result, reused: true });
  }

  const aiConfig = await getAIConfig();
  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      if (!isAdmin) await consumeEntitlementTx(tx, accountId, EntKind.ASSESSMENT_CREDIT, pending.length);
      await tx.runQuote.update({ where: { id: quote.id }, data: { status: "CONSUMED" } });
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
            progressTotal: scoringPassCount(controlSet.controls.length, item.integrity.charCount),
            progressUpdatedAt: new Date()
          }
        });
        return { ...item, assessment, ledger };
      }));
    });
  } catch (error) {
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
      delivered.push({ assessmentId: saved.id, orgName: item.orgName, result, reused: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Assessment failed";
      await prisma.assessment.update({
        where: { id: item.assessment.id },
        data: {
          status: isAdmin ? "FAILED" : "REFUNDED",
          progressStage: isAdmin ? "FAILED" : "REFUNDED",
          progressMessage: isAdmin ? "Assessment processing failed." : "Assessment processing failed and the purchased credit was restored.",
          progressUpdatedAt: new Date()
        }
      }).catch(() => undefined);
      await prisma.usageLedger.update({ where: { id: item.ledger.id }, data: { assessmentId: item.assessment.id, status: isAdmin ? "failed" : "refunded" } }).catch(() => undefined);
      if (!isAdmin) await restoreEntitlement(accountId, EntKind.ASSESSMENT_CREDIT, 1, item.assessment.id).catch(() => undefined);
      failed.push({ assessmentId: item.assessment.id, orgName: item.orgName, error: message });
    }
  }

  if (!delivered.length) {
    return NextResponse.json({ error: "Assessment processing failed. Purchased credits were restored.", failed }, { status: 500 });
  }
  const networkReport = assessmentScope === "network" ? buildNetworkReport(parentOrgName!, delivered) : null;
  if (networkReport) {
    await prisma.runQuote.update({
      where: { id: quote.id },
      data: { networkResult: networkReport, networkGeneratedAt: new Date() }
    });
  }
  return NextResponse.json({ assessments: delivered, networkReport, quoteId: quote.id, failed, assessmentId: delivered[0].assessmentId, result: delivered[0].result });
}
