import type { NormalizedControl } from "@/lib/control-boards";

export type IrpBucketDefinition = {
  id: string;
  label: string;
  points: number;
  description: string;
  patterns: RegExp[];
};

export type ProfiledControl = NormalizedControl & {
  bucket_id: string;
  bucket_label: string;
  bucket_points: number;
  capability: string;
  essential: boolean;
};

export const IRP_SCORING_PROFILE_VERSION = "irp-capability-buckets-v1";

export const IRP_CAPABILITY_BUCKETS: IrpBucketDefinition[] = [
  {
    id: "governance-authority",
    label: "Governance and authority",
    points: 10,
    description: "Plan ownership, executive authority, accountable roles, and policy governance.",
    patterns: [/govern/i, /authorit/i, /responsib/i, /management/i, /policy/i, /program/i, /risk analysis/i, /risk management/i]
  },
  {
    id: "identification-reporting",
    label: "Identification and reporting",
    points: 10,
    description: "Detection, workforce reporting, intake, logging, and initial incident recognition.",
    patterns: [/detect/i, /identif/i, /monitor/i, /report/i, /event/i, /incident log/i, /security incident/i]
  },
  {
    id: "triage-escalation",
    label: "Triage and escalation",
    points: 8,
    description: "Severity classification, prioritization, escalation, and activation criteria.",
    patterns: [/triage/i, /severit/i, /classif/i, /escalat/i, /prioriti/i, /activation/i, /impact assessment/i]
  },
  {
    id: "containment-eradication",
    label: "Containment and eradication",
    points: 12,
    description: "Immediate containment, mitigation, eradication, and coordinated response actions.",
    patterns: [/contain/i, /eradica/i, /isolat/i, /mitigat/i, /remediat/i, /response action/i, /incident handling/i]
  },
  {
    id: "recovery-continuity",
    label: "Recovery and continuity",
    points: 10,
    description: "Recovery, restoration, contingency operations, continuity, and validated return to service.",
    patterns: [/recover/i, /restor/i, /continuit/i, /contingenc/i, /backup/i, /emergency operation/i, /return to service/i]
  },
  {
    id: "communications",
    label: "Communications",
    points: 8,
    description: "Internal, external, leadership, patient, media, and emergency communications.",
    patterns: [/communicat/i, /contact/i, /coordina/i, /media/i, /public information/i, /message/i]
  },
  {
    id: "evidence-forensics",
    label: "Evidence and forensics",
    points: 8,
    description: "Evidence preservation, audit records, forensic support, and chain of custody.",
    patterns: [/evidence/i, /forensic/i, /chain of custody/i, /preserv/i, /audit log/i, /audit record/i, /logging/i]
  },
  {
    id: "privacy-data",
    label: "Privacy and sensitive data handling",
    points: 10,
    description: "Protection, mitigation, disclosure controls, and handling of regulated or sensitive data during response.",
    patterns: [/\bphi\b/i, /protected health/i, /privacy/i, /confidential/i, /disclos/i, /minimum necessary/i, /health information/i]
  },
  {
    id: "regulatory-notification",
    label: "Regulatory notification",
    points: 10,
    description: "Breach determination, required notification, regulatory reporting, and documented deadlines.",
    patterns: [/notif/i, /breach/i, /regulat/i, /law enforcement/i, /department of health/i, /secretary/i, /\bhhs\b/i, /\bocr\b/i]
  },
  {
    id: "third-party-coordination",
    label: "Third-party coordination",
    points: 5,
    description: "Business associate, vendor, supplier, partner, and external service-provider response duties.",
    patterns: [/business associate/i, /third[- ]party/i, /vendor/i, /supplier/i, /service provider/i, /contractor/i]
  },
  {
    id: "training-testing",
    label: "Training and testing",
    points: 5,
    description: "Training, exercises, simulations, tabletop testing, and response validation.",
    patterns: [/train/i, /test/i, /exercise/i, /tabletop/i, /simulat/i, /awareness/i, /drill/i]
  },
  {
    id: "maintenance-improvement",
    label: "Maintenance and improvement",
    points: 4,
    description: "Scheduled review, lessons learned, corrective action, metrics, and plan maintenance.",
    patterns: [/lessons learned/i, /corrective action/i, /maintain/i, /maintenance/i, /review/i, /update/i, /metric/i, /improvement/i]
  }
];

const DIRECTLY_RELEVANT_STANDARDS = new Set(["HITECH", "EP"]);
const IRP_RELEVANCE = /incident|breach|emergenc|contingenc|recover|response|detect|report|notif|forensic|evidence|audit|monitor|escalat|contain|eradica|continu|business associate|third[- ]party|risk analys|risk management|security event|training|exercise|test|communicat|protected health|\bphi\b|privacy|disclos|access control|integrity|availability/i;

function controlText(control: NormalizedControl) {
  return `${control.id} ${control.category} ${control.requirement}`;
}

export function isIrpApplicableControl(control: NormalizedControl) {
  const standard = control.standard.trim().toLocaleUpperCase();
  if (DIRECTLY_RELEVANT_STANDARDS.has(standard)) return true;
  return IRP_RELEVANCE.test(controlText(control));
}

function bucketForControl(control: NormalizedControl) {
  const text = controlText(control);
  const governance = IRP_CAPABILITY_BUCKETS.find((bucket) => bucket.id === "governance-authority")!;
  return IRP_CAPABILITY_BUCKETS
    .filter((bucket) => bucket.id !== governance.id)
    .find((bucket) => bucket.patterns.some((pattern) => pattern.test(text))) || governance;
}

function capabilityName(control: NormalizedControl, bucket: IrpBucketDefinition) {
  const category = control.category.trim();
  return category && category.toLocaleLowerCase() !== "general" ? category : bucket.label;
}

export function profileIrpControls(controls: NormalizedControl[]) {
  const applicable = controls.filter(isIrpApplicableControl).map((control): ProfiledControl => {
    const bucket = bucketForControl(control);
    return {
      ...control,
      bucket_id: bucket.id,
      bucket_label: bucket.label,
      bucket_points: bucket.points,
      capability: capabilityName(control, bucket),
      essential: control.risk_level.trim().toLocaleLowerCase() === "critical"
    };
  });
  if (!applicable.length) {
    throw new Error("The selected control boards do not contain controls applicable to an incident response plan assessment.");
  }
  return {
    controls: applicable,
    excludedCount: controls.length - applicable.length,
    profileVersion: IRP_SCORING_PROFILE_VERSION,
    buckets: IRP_CAPABILITY_BUCKETS
  };
}
