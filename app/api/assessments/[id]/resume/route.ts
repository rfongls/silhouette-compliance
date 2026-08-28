import { EntKind } from "@prisma/client";
import { NextResponse } from "next/server";
import { assessmentFailureReason } from "@/lib/assessment-failure";
import { runGapAnalysis } from "@/lib/analysis/engine";
import { providerFailureEvidence } from "@/lib/analysis/anthropic";
import { IRP_PROMPT_VERSION } from "@/lib/analysis/prompts";
import { SCORING_POLICY_VERSION, type AnalysisPassCheckpoint } from "@/lib/analysis/scoring";
import { requireSession } from "@/lib/authz";
import { loadPublishedControlSet } from "@/lib/control-boards";
import { assessmentFingerprint, documentSetIntegrity, type IntegrityDocument } from "@/lib/document-integrity";
import { consumeEntitlementTx, PaymentRequiredError, restoreEntitlement } from "@/lib/entitlements";
import { buildNetworkReport } from "@/lib/network-report";
import { prisma } from "@/lib/prisma";
import { getAIConfig } from "@/lib/settings";
import { isEffectiveAdmin } from "@/lib/view-role";

function sameHashes(stored: unknown, current: string[]) {
  if (!Array.isArray(stored)) return false;
  const left = stored.map(String).sort();
  const right = [...current].sort();
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function snapshotStandards(snapshot: unknown) {
  if (!Array.isArray(snapshot)) return [];
  return snapshot
    .map((row) => row && typeof row === "object" && "standardKey" in row ? String(row.standardKey) : "")
    .filter(Boolean);
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const guard = await requireSession("customer");
  if ("response" in guard) return guard.response;
  const accountId = guard.session.user.accountId;
  const isAdmin = isEffectiveAdmin(guard.session);
  const body = await req.json().catch(() => ({}));
  if (body.phiAttested !== true) {
    return NextResponse.json({ error: "Confirm that the uploader reviewed the files and removed PHI before continuing." }, { status: 400 });
  }

  const assessment = await prisma.assessment.findFirst({
    where: { id: params.id, accountId },
    include: { ledger: true, checkpoints: { orderBy: { createdAt: "asc" } } }
  });
  if (!assessment) return NextResponse.json({ error: "Failed assessment not found." }, { status: 404 });
  if (assessment.status !== "FAILED" && assessment.status !== "REFUNDED") {
    return NextResponse.json({ error: "Only a failed assessment can be continued." }, { status: 409 });
  }

  const orgName = assessment.orgName || "Organization";
  const documents: IntegrityDocument[] = Array.isArray(body.documents)
    ? body.documents
      .map((document: any) => ({
        name: String(document?.name || "document.txt"),
        text: String(document?.text || ""),
        orgName: String(document?.orgName || orgName).trim()
      }))
      .filter((document: IntegrityDocument) => document.orgName === orgName && document.text.trim())
    : [];
  if (!documents.length) {
    return NextResponse.json({ error: `Reattach the original policy files for ${orgName} before continuing.` }, { status: 400 });
  }

  const integrity = documentSetIntegrity(documents);
  if (!sameHashes(assessment.documentHashes, integrity.hashes)) {
    return NextResponse.json({ error: "The reattached policies do not match the original failed run. Attach the same files or prepare a new assessment." }, { status: 409 });
  }

  const standards = snapshotStandards(assessment.boardSnapshot);
  if (!standards.length) {
    return NextResponse.json({ error: "The failed run does not contain a resumable control-board snapshot. Prepare a new assessment." }, { status: 409 });
  }
  let controlSet: Awaited<ReturnType<typeof loadPublishedControlSet>>;
  try {
    controlSet = await loadPublishedControlSet(assessment.industry, standards);
  } catch (error) {
    return NextResponse.json({ error: `${(error as Error).message}. Restore the published control boards before continuing.` }, { status: 409 });
  }
  const fingerprint = assessmentFingerprint(integrity.sourceSetHash, controlSet.snapshot, IRP_PROMPT_VERSION, SCORING_POLICY_VERSION);
  if (fingerprint !== assessment.sourceSetHash) {
    return NextResponse.json({ error: "The scoring profile or published control boards changed after this run failed. Prepare a new assessment so the report uses one consistent scoring basis." }, { status: 409 });
  }

  let aiConfig: Awaited<ReturnType<typeof getAIConfig>>;
  try {
    aiConfig = await getAIConfig();
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The AI provider is not configured." }, { status: 503 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.assessment.updateMany({
        where: { id: assessment.id, accountId, status: assessment.status },
        data: {
          status: "RUNNING",
          progressStage: assessment.checkpoints.length ? "RESUMING" : "RETRYING",
          progressMessage: assessment.checkpoints.length
            ? `Continuing after ${assessment.checkpoints.length} completed analysis passes.`
            : "Retrying this assessment from the first analysis pass.",
          progressUpdatedAt: new Date(),
          failureProvider: null,
          failureModel: null,
          failureHttpStatus: null,
          failureCode: null,
          failureRequestId: null,
          failureRetriable: null,
          failureAttempts: 0,
          failureStage: null,
          failedAt: null
        }
      });
      if (claimed.count !== 1) throw new Error("This failed assessment was already continued in another session.");
      if (!isAdmin) {
        await consumeEntitlementTx(tx, accountId, EntKind.ASSESSMENT_CREDIT, 1);
      }
      if (assessment.ledger) {
        await tx.usageLedger.update({ where: { id: assessment.ledger.id }, data: { status: isAdmin ? "admin_comped" : "processing" } });
      }
    });
  } catch (error) {
    if (error instanceof PaymentRequiredError) {
      return NextResponse.json({ error: "The restored assessment credit is no longer available. Add a credit before continuing this run." }, { status: 402 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not continue the failed assessment." }, { status: 409 });
  }

  const completedPasses: AnalysisPassCheckpoint[] = assessment.checkpoints.map((checkpoint) => ({
    passKey: checkpoint.passKey,
    controlBatch: checkpoint.controlBatch,
    evidenceChunk: checkpoint.evidenceChunk,
    evaluations: checkpoint.evaluations as unknown as AnalysisPassCheckpoint["evaluations"],
    inputTokens: checkpoint.inputTokens,
    outputTokens: checkpoint.outputTokens
  }));

  try {
    const { result: modelResult, usage } = await runGapAnalysis({
      orgName,
      industry: assessment.industry,
      standards,
      documents: documents.map(({ name, text }) => ({ name, text })),
      controls: controlSet.controls,
      boardCite: controlSet.cite,
      completedPasses,
      onProgress: async (progress) => {
        await prisma.assessment.update({
          where: { id: assessment.id },
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
          where: { assessmentId_passKey: { assessmentId: assessment.id, passKey: checkpoint.passKey } },
          create: {
            assessmentId: assessment.id,
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

    const result = {
      ...modelResult,
      data_handling: {
        status: "UPLOADER_ATTESTED_NO_KNOWN_PHI",
        message: "The uploader attested that they reviewed the submitted files and removed PHI. Silhouette did not inspect, classify, or certify the uploads for PHI.",
        affects_score: false
      },
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
      where: { id: assessment.id },
      data: {
        status: "DELIVERED",
        score: result.compliance_score,
        posture: result.overall_posture,
        result,
        progressStage: "DELIVERED",
        progressMessage: "Assessment and report completed.",
        progressCurrent: assessment.progressTotal,
        progressUpdatedAt: new Date()
      }
    });
    if (assessment.ledger) {
      await prisma.usageLedger.update({
        where: { id: assessment.ledger.id },
        data: { assessmentId: assessment.id, status: isAdmin ? "admin_comped" : "succeeded", inputTokens: usage.inputTokens, outputTokens: usage.outputTokens }
      });
    }
    await prisma.assessmentPassCheckpoint.deleteMany({ where: { assessmentId: assessment.id } }).catch(() => undefined);

    let networkReport = null;
    let reportAssessments = [{ assessmentId: saved.id, orgName, result }];
    const quoteId = assessment.ledger?.quoteId || null;
    if (quoteId) {
      const quote = await prisma.runQuote.findFirst({ where: { id: quoteId, accountId } });
      const delivered = await prisma.assessment.findMany({
        where: { accountId, status: "DELIVERED", ledger: { is: { quoteId } } },
        orderBy: { createdAt: "asc" },
        select: { id: true, orgName: true, result: true }
      });
      const reportRows = delivered.filter((row) => row.result).map((row) => ({ assessmentId: row.id, orgName: row.orgName || "Organization", result: row.result }));
      reportAssessments = reportRows.map((row) => ({ assessmentId: row.assessmentId, orgName: row.orgName, result: row.result as typeof result }));
      networkReport = quote?.assessmentScope === "network" && quote.parentOrgName ? buildNetworkReport(quote.parentOrgName, reportRows) : null;
      await prisma.runQuote.update({
        where: { id: quoteId },
        data: { reportAssessmentIds: reportRows.map((row) => row.assessmentId), networkResult: networkReport || undefined, networkGeneratedAt: networkReport ? new Date() : undefined }
      });
    }
    return NextResponse.json({ assessmentId: saved.id, quoteId, result, assessments: reportAssessments, networkReport, resumedPasses: completedPasses.length });
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
    const checkpointCount = await prisma.assessmentPassCheckpoint.count({ where: { assessmentId: assessment.id } });
    await prisma.assessment.update({
      where: { id: assessment.id },
      data: {
        status: isAdmin ? "FAILED" : "REFUNDED",
        progressStage: isAdmin ? "FAILED" : "REFUNDED",
        progressMessage: isAdmin ? failureReason : `${failureReason} The purchased credit was restored.`,
        progressCurrent: checkpointCount,
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
    if (assessment.ledger) {
      await prisma.usageLedger.update({ where: { id: assessment.ledger.id }, data: { status: isAdmin ? "failed" : "refunded" } }).catch(() => undefined);
    }
    if (!isAdmin) await restoreEntitlement(accountId, EntKind.ASSESSMENT_CREDIT, 1, assessment.id).catch(() => undefined);
    return NextResponse.json({ error: isAdmin ? failureReason : `${failureReason} The purchased credit was restored.`, assessmentId: assessment.id, checkpointCount }, { status: 500 });
  }
}
