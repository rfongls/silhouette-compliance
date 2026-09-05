type Finding = {
  control_id?: string;
  control_ids?: string[];
  control_name?: string;
  capability?: string;
  bucket_id?: string;
  finding?: string;
};

type RoadmapItem = {
  number?: number;
  title?: string;
  description?: string;
  implementation?: string;
  deliverable?: string;
  validation?: string;
  gap_summary?: string;
  references?: string[];
  bucket_id?: string;
  capability?: string;
};

type RoadmapPhase = {
  name?: string;
  timeframe?: string;
  color?: string;
  items?: RoadmapItem[];
  [key: string]: unknown;
};

type RemediationPlan = {
  title: string;
  implementation: string;
  deliverable: string;
  validation: string;
};

const PLAYBOOK: Record<string, RemediationPlan> = {
  "governance-authority": {
    title: "Establish IRP governance and decision authority",
    implementation: "Update the IRP to name an executive sponsor, incident commander, alternates, accountable functions, approval authority, and the escalation path used to activate the plan.",
    deliverable: "Approved IRP governance matrix and documented role assignments",
    validation: "Obtain owner acknowledgments and confirm during an exercise that the named leaders can activate the plan and make required decisions."
  },
  "identification-reporting": {
    title: "Implement incident identification and intake procedures",
    implementation: "Document reporting channels, detection sources, intake criteria, required incident record fields, after-hours handling, and the process for assigning and tracking each reported event.",
    deliverable: "Incident intake procedure, reporting guide, and incident log template",
    validation: "Submit a test incident through each reporting channel and verify that it creates a complete, timestamped, assigned record."
  },
  "triage-escalation": {
    title: "Define triage, severity, and escalation rules",
    implementation: "Create a severity matrix with impact criteria, classification examples, response targets, notification thresholds, escalation contacts, and plan activation requirements.",
    deliverable: "Approved severity matrix and escalation decision tree",
    validation: "Apply the matrix to representative scenarios and confirm that responders reach consistent severity and escalation decisions."
  },
  "containment-eradication": {
    title: "Formalize containment and eradication procedures",
    implementation: "Define authorized containment actions, system isolation criteria, emergency change authority, eradication steps, decision logging, and approval requirements for high-impact response actions.",
    deliverable: "Containment and eradication playbooks with approval and evidence checkpoints",
    validation: "Run a tabletop scenario and verify that responders can select, authorize, document, and reverse containment actions."
  },
  "recovery-continuity": {
    title: "Establish validated recovery and continuity procedures",
    implementation: "Document restoration priorities, backup and recovery dependencies, integrity checks, business-owner acceptance, return-to-service approval, and contingency operations when recovery targets cannot be met.",
    deliverable: "Recovery playbook, restoration checklist, and return-to-service approval record",
    validation: "Restore a representative system or dataset and retain evidence that integrity, security, and business acceptance checks passed."
  },
  communications: {
    title: "Create an incident communications plan",
    implementation: "Document audiences, message owners, approval paths, secure communication channels, contact lists, update cadence, and templates for workforce, leadership, partners, patients, media, and public communications.",
    deliverable: "Incident communications matrix, current contact list, and approved message templates",
    validation: "Exercise an internal and external notification scenario and record approvals, delivery timestamps, and contact-list corrections."
  },
  "evidence-forensics": {
    title: "Implement evidence preservation and forensic handling",
    implementation: "Define evidence collection authority, chain-of-custody steps, approved storage, access restrictions, integrity verification, forensic escalation triggers, retention, and disposition requirements.",
    deliverable: "Evidence handling procedure, custody form, and protected evidence repository",
    validation: "Collect a sample artifact and verify its identifier, custodian, timestamps, integrity value, transfer history, and restricted access."
  },
  "privacy-data": {
    title: "Formalize privacy and sensitive-data response controls",
    implementation: "Add procedures to identify affected data, limit access and disclosure, apply minimum-necessary handling, engage privacy leadership, document mitigation, and preserve the facts needed for a breach determination.",
    deliverable: "Privacy incident checklist and sensitive-data handling procedure",
    validation: "Walk through a suspected disclosure scenario and confirm that data scope, access, mitigation, and privacy decisions are documented."
  },
  "regulatory-notification": {
    title: "Publish a regulatory notification matrix",
    implementation: "Document notification triggers, decision owners, legal review, applicable deadlines, required recipients, content requirements, after-hours contacts, and proof-of-notification retention.",
    deliverable: "Jurisdiction-specific notification matrix, decision record, and notification templates",
    validation: "Test a breach scenario against the matrix and verify the correct decision maker, recipients, deadline, content, and retained evidence."
  },
  "third-party-coordination": {
    title: "Define third-party incident coordination requirements",
    implementation: "Document vendor and business-associate reporting duties, contact and escalation paths, evidence-sharing rules, response participation, contractual deadlines, and closure responsibilities.",
    deliverable: "Third-party response matrix and contract requirement checklist",
    validation: "Review critical-provider agreements and test notification and coordination with at least one representative provider."
  },
  "training-testing": {
    title: "Establish an incident response training and exercise program",
    implementation: "Set required role-based training and exercise frequencies, scenario rotation, participants, objectives, success criteria, attendance evidence, after-action reporting, and corrective-action ownership.",
    deliverable: "Annual training and exercise calendar with exercise and after-action templates",
    validation: "Complete an exercise, document attendance and results, assign corrective actions, and obtain leadership review."
  },
  "maintenance-improvement": {
    title: "Implement plan maintenance and corrective-action tracking",
    implementation: "Define scheduled and event-driven reviews, version control, distribution and acknowledgment, lessons-learned intake, corrective-action owners and due dates, metrics, and escalation for overdue work.",
    deliverable: "IRP review schedule, revision log, distribution record, and corrective-action register",
    validation: "Review the current cycle and verify that changes, acknowledgments, lessons learned, owners, due dates, and overdue escalations are recorded."
  }
};

function fallbackPlan(finding: Finding): RemediationPlan {
  const capability = finding.capability || finding.control_name || finding.control_id || "identified capability";
  return {
    title: `Implement ${capability}`,
    implementation: `Document and implement the missing requirements for ${capability}, including accountable roles, required procedures, decision criteria, records, and escalation paths identified by the mapped controls.`,
    deliverable: `Approved ${capability} procedure and supporting operational records`,
    validation: "Review the updated documentation, test the procedure with a representative scenario, and retain evidence that the mapped requirements operate as written."
  };
}

function planFor(finding: Finding): RemediationPlan {
  return PLAYBOOK[finding.bucket_id || ""] || fallbackPlan(finding);
}

function findingReferences(finding: Finding) {
  const references = finding.control_ids?.length ? finding.control_ids : [finding.control_id];
  return [...new Set(references.filter(Boolean).map((reference) => String(reference)))];
}

export function buildActionableRoadmapItem(finding: Finding, number: number) {
  const plan = planFor(finding);
  return {
    number,
    title: plan.title,
    description: plan.implementation,
    implementation: plan.implementation,
    deliverable: plan.deliverable,
    validation: plan.validation,
    gap_summary: finding.finding || "The submitted documentation did not fully evidence the mapped requirements.",
    references: findingReferences(finding),
    bucket_id: finding.bucket_id,
    capability: finding.capability || finding.control_name
  };
}

function findSourceFinding(item: RoadmapItem, findings: Finding[]) {
  const references = new Set((item.references || []).map((value) => String(value).toLocaleUpperCase()));
  return findings.find((finding) => {
    if (item.bucket_id && finding.bucket_id === item.bucket_id && (!item.capability || finding.capability === item.capability)) return true;
    return Boolean(finding.control_id && references.has(finding.control_id.toLocaleUpperCase())) ||
      findingReferences(finding).some((reference) => references.has(reference.toLocaleUpperCase())) ||
      Boolean(finding.control_id && String(item.title || "").toLocaleUpperCase().startsWith(finding.control_id.toLocaleUpperCase()));
  });
}

export function resolveRoadmapItem(item: RoadmapItem, findings: Finding[] = []) {
  const sourceFinding = findSourceFinding(item, findings);
  const finding = sourceFinding || {
    bucket_id: item.bucket_id,
    capability: item.capability,
    control_id: item.references?.[0]
  };
  const plan = planFor(finding);
  const legacyGenerated = / remediation$/i.test(item.title || "") || /controls? (?:not|partially) evidenced/i.test(item.description || "");
  return {
    ...item,
    title: legacyGenerated ? plan.title : item.title || plan.title,
    implementation: item.implementation || (legacyGenerated ? plan.implementation : item.description) || plan.implementation,
    deliverable: item.deliverable || plan.deliverable,
    validation: item.validation || plan.validation,
    gap_summary: item.gap_summary || finding.finding || (legacyGenerated ? item.description : undefined),
    references: sourceFinding ? findingReferences(sourceFinding) : (item.references?.length ? item.references : findingReferences(finding))
  };
}

const ROADMAP_HORIZONS = [
  { name: "Immediate", timeframe: "Within 30 days", color: "critical" },
  { name: "Mid-term", timeframe: "31 to 60 days", color: "high" },
  { name: "Long-term", timeframe: "61 to 90 days", color: "medium" }
];

function roadmapAllocations(total: number) {
  if (total <= 0) return [0, 0, 0];
  if (total === 1) return [1, 0, 0];
  if (total === 2) return [1, 1, 0];
  if (total === 3) return [1, 1, 1];
  if (total === 4) return [2, 1, 1];
  return [2, 2, total - 4];
}

export function limitRoadmapActions(phases: RoadmapPhase[] = [], limit = 5) {
  const items = phases
    .flatMap((phase) => Array.isArray(phase.items) ? phase.items : [])
    .slice(0, Math.max(0, limit))
    .map((item, index) => ({ ...item, number: index + 1 }));
  const allocations = roadmapAllocations(items.length);
  let offset = 0;

  return ROADMAP_HORIZONS.flatMap((horizon, index) => {
    const horizonItems = items.slice(offset, offset + allocations[index]);
    offset += allocations[index];
    return horizonItems.length ? [{ ...horizon, items: horizonItems }] : [];
  });
}
