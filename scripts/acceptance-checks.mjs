import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const mustExist = [
  "app/api/assess/route.ts",
  "app/api/checkout/route.ts",
  "app/api/webhooks/stripe/route.ts",
  "app/api/sra/[id]/evidence/route.ts",
  "prisma/schema.prisma"
];
for (const rel of mustExist) {
  if (!fs.existsSync(path.join(root, rel))) throw new Error(`Missing ${rel}`);
}
const assess = fs.readFileSync(path.join(root, "app/api/assess/route.ts"), "utf8");
const assessmentHandler = fs.readFileSync(path.join(root, "lib/irp-assessment.ts"), "utf8");
if (!assess.includes("handleIrpAssessment")) throw new Error("/api/assess must delegate to the reviewed IRP assessment handler");
if (!assessmentHandler.includes("await consumeEntitlementTx") || assessmentHandler.indexOf("await consumeEntitlementTx") > assessmentHandler.indexOf("await runGapAnalysis")) throw new Error("/api/assess must gate before model call");
if (/document.*create|source.*create/i.test(assessmentHandler)) throw new Error("Potential source document persistence in /api/assess");
const schema = fs.readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");
for (const token of ["ControlBoard", "Assessment", "UsageLedger", "Entitlement", "SraEngagement", "SraEvidence"]) {
  if (!schema.includes(`model ${token}`)) throw new Error(`Schema missing ${token}`);
}
const evidence = fs.readFileSync(path.join(root, "lib/sra/storage.ts"), "utf8");
if (!evidence.includes("aes-256-gcm") || !evidence.includes("PutObjectCommand")) throw new Error("SRA evidence must encrypt before external object storage");
const landing = fs.readFileSync(path.join(root, "components/LandingSections.tsx"), "utf8");
for (const staleClaim of ["We store nothing", "without storing your private data", "No PHI / client data collected", "Analysis runs on a zero-retention tier"]) {
  if (landing.includes(staleClaim)) throw new Error(`Landing page contains outdated retention claim: ${staleClaim}`);
}
if (!landing.includes("Silhouette does not retain uploaded source files") || !landing.includes("Completed reports are stored securely for account access")) {
  throw new Error("Landing page must distinguish discarded source files from retained completed reports");
}
console.log("Acceptance static checks passed");
