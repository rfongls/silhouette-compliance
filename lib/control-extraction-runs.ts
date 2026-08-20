import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

export type ExtractionStandardStatus = {
  standardKey: string;
  label: string;
  status: "PENDING" | "RUNNING" | "COMPLETE" | "FAILED";
  message: string;
  controlCount?: number;
  boardId?: string;
};

export type ControlExtractionRun = {
  id: string;
  industry: string;
  status: "RUNNING" | "COMPLETED" | "FAILED";
  phase: "CHECKING_SOURCES" | "EXTRACTING" | "CREATING_DRAFTS" | "COMPLETED" | "FAILED";
  completedStandards: number;
  totalStandards: number;
  currentStandard: string | null;
  standards: ExtractionStandardStatus[];
  startedBy: string;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  error: string | null;
  sourceHashes: Record<string, string>;
};

const RUN_PREFIX = "controlExtractionRun:";
const STALE_RUN_MS = 45 * 60 * 1000;

function keyFor(industry: string) {
  return `${RUN_PREFIX}${industry}`;
}

function parseRun(value?: string | null): ControlExtractionRun | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as ControlExtractionRun;
  } catch {
    return null;
  }
}

export async function getControlExtractionRun(industry: string) {
  const setting = await prisma.appSetting.findUnique({ where: { key: keyFor(industry) } });
  return parseRun(setting?.value);
}

function sourceFingerprint(sourceHashes: Record<string, string>) {
  return JSON.stringify(Object.entries(sourceHashes).sort(([left], [right]) => left.localeCompare(right)));
}

export async function acquireControlExtractionRun(
  industry: string,
  startedBy: string,
  sourceHashes: Record<string, string>,
  forceNew = false
) {
  const key = keyFor(industry);
  const setting = await prisma.appSetting.findUnique({ where: { key } });
  const existing = parseRun(setting?.value);
  const existingIsActive = existing?.status === "RUNNING"
    && Date.now() - new Date(existing.updatedAt).getTime() < STALE_RUN_MS;
  if (existingIsActive) throw new Error("A control extraction is already running for this domain.");
  if (existing?.status === "COMPLETED" && sourceFingerprint(existing.sourceHashes || {}) === sourceFingerprint(sourceHashes)) {
    throw new Error("Drafts were already created for this exact official source set. Review those drafts instead of submitting the paid extraction again.");
  }

  const now = new Date().toISOString();
  const resumable = Boolean(!forceNew
    && existing
    && existing.status !== "COMPLETED"
    && sourceFingerprint(existing.sourceHashes || {}) === sourceFingerprint(sourceHashes));
  const run: ControlExtractionRun = resumable ? {
    ...existing!,
    status: "RUNNING",
    phase: "CHECKING_SOURCES",
    currentStandard: null,
    startedBy,
    updatedAt: now,
    completedAt: null,
    error: null
  } : {
    id: crypto.randomUUID(),
    industry,
    status: "RUNNING",
    phase: "CHECKING_SOURCES",
    completedStandards: 0,
    totalStandards: 0,
    currentStandard: null,
    standards: [],
    startedBy,
    startedAt: now,
    updatedAt: now,
    completedAt: null,
    error: null,
    sourceHashes
  };
  const value = JSON.stringify(run);

  if (!setting) {
    try {
      await prisma.appSetting.create({ data: { key, value } });
      return { run, resumed: false };
    } catch {
      throw new Error("A control extraction was started by another request. Follow the active run instead of submitting again.");
    }
  }

  const acquired = await prisma.appSetting.updateMany({
    where: { key, value: setting.value },
    data: { value }
  });
  if (acquired.count !== 1) {
    throw new Error("A control extraction was started by another request. Follow the active run instead of submitting again.");
  }
  return { run, resumed: resumable };
}

export async function updateControlExtractionRun(
  industry: string,
  runId: string,
  update: (run: ControlExtractionRun) => ControlExtractionRun
) {
  const key = keyFor(industry);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const setting = await prisma.appSetting.findUnique({ where: { key } });
    const current = parseRun(setting?.value);
    if (!setting || !current || current.id !== runId) {
      throw new Error("The active control extraction run could not be found.");
    }
    const next = update({ ...current, updatedAt: new Date().toISOString() });
    const saved = await prisma.appSetting.updateMany({
      where: { key, value: setting.value },
      data: { value: JSON.stringify(next) }
    });
    if (saved.count === 1) return next;
  }
  throw new Error("The control extraction status could not be updated.");
}
