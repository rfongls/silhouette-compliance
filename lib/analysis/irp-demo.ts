import { demoOrgName } from "@/lib/demo";

export type DemoPolicySection = {
  number: string;
  title: string;
  paragraphs?: readonly string[];
  bullets?: readonly string[];
};

export const DEMO_POLICY_NAME = "JCHC-Incident-Response-Plan-v3.2-2026.pdf";

export const DEMO_POLICY_SECTIONS: readonly DemoPolicySection[] = [
  {
    number: "1",
    title: "Purpose",
    paragraphs: [
      "This plan establishes the coordinated process Johnson Community Health Center (JCHC) uses to prepare for, identify, report, assess, contain, eradicate, and recover from information security incidents. The process is intended to protect patient care, workforce safety, regulated information, clinical operations, and the availability and integrity of JCHC systems.",
      "The plan provides a common operating structure for technical, privacy, legal, clinical, communications, and executive participants. It authorizes the Incident Commander to direct response activities, request additional resources, and make risk-based containment decisions when delay could increase harm.",
      "This document is used together with the Business Continuity Plan, Disaster Recovery Plan, Privacy Incident Procedures, Emergency Operations Plan, and applicable vendor response procedures. If requirements conflict, JCHC follows the requirement that provides the greatest protection or the shortest required response time."
    ]
  },
  {
    number: "2",
    title: "Scope",
    paragraphs: [
      "This plan applies to all employees, credentialed providers, contractors, volunteers, students, temporary personnel, and other workforce members who use or support JCHC information resources. It covers all clinics, administrative locations, remote-work environments, hosted applications, cloud services, networks, endpoints, medical devices, telecommunications services, and paper or electronic records owned, leased, or operated by JCHC.",
      "Covered events include suspected or confirmed unauthorized access, malware, ransomware, phishing, lost or stolen devices, misuse of credentials, inappropriate disclosure, data alteration, service interruption, vendor compromise, denial of service, physical intrusion affecting systems, and any event that may affect electronic protected health information (ePHI), personally identifiable information, payment information, or essential patient-care services.",
      "Routine service requests and operational outages remain under normal IT service management unless evidence suggests malicious activity, regulated-data exposure, material patient-care impact, or a need for coordinated executive response. Vendors and business associates must notify their JCHC relationship owner of incidents affecting JCHC data or services."
    ]
  },
  {
    number: "3",
    title: "Authority and References",
    paragraphs: [
      "The Board Compliance and Risk Committee delegates operational incident-response authority to the Chief Information Security Officer (CISO). The CISO serves as Incident Commander unless authority is transferred in writing to the Chief Information Officer, Privacy Officer, or another qualified response leader.",
      "Response activities must preserve legal privilege when directed by Legal Counsel and must not interfere with patient care, emergency operations, or law-enforcement instructions. The Incident Commander may isolate systems, suspend accounts, block network traffic, engage retained response vendors, and direct emergency changes when those actions are proportionate to the documented risk."
    ],
    bullets: [
      "HIPAA Security Rule and Privacy Rule, 45 CFR Parts 160 and 164",
      "HITECH Act breach notification requirements",
      "NIST SP 800-53 Rev. 5 incident response, audit, contingency planning, and communications controls",
      "NIST SP 800-61 incident handling guidance",
      "JCHC Business Continuity, Disaster Recovery, Privacy Incident, and Emergency Operations procedures",
      "Applicable payer, grant, business-associate, cyber-insurance, and service-provider agreements"
    ]
  },
  {
    number: "4",
    title: "Incident Classification",
    paragraphs: [
      "The Security Office assigns an initial severity after validating the report and considering patient safety, clinical disruption, data sensitivity, number of affected individuals, threat activity, geographic scope, recovery complexity, legal obligations, and reputational impact. Severity may be raised or lowered as evidence changes, and each change must be recorded in the incident log with the approving responder and rationale.",
      "Any event involving active ransomware, material disruption to clinical services, suspected large-scale ePHI disclosure, patient-safety risk, or compromise of privileged infrastructure begins at Severity 1 until the Incident Commander documents a lower classification. Multiple related events are managed as one incident when they share a cause, threat actor, affected service, or response strategy."
    ],
    bullets: [
      "Severity 1 - Crisis: active threat to patient safety, widespread clinical outage, destructive attack, privileged compromise, or confirmed large-scale disclosure. Activate the full response team and executive leadership immediately.",
      "Severity 2 - High: confirmed compromise or regulated-data exposure with limited operational scope. Activate required technical, privacy, legal, and business owners.",
      "Severity 3 - Moderate: credible suspected event requiring investigation, enhanced monitoring, or limited containment. Security leads the response and escalates when impact grows.",
      "Severity 4 - Low: policy violation, blocked attack, or low-impact event contained through routine operations. Document and trend the event for recurring patterns."
    ]
  },
  {
    number: "5",
    title: "Roles and Responsibilities",
    paragraphs: [
      "The Incident Commander establishes objectives, approves severity, assigns workstreams, resolves conflicts, authorizes major containment and recovery decisions, and determines when the incident can close. A scribe maintains the chronology, decisions, action owners, evidence references, costs, and status updates in the designated incident record.",
      "Participants use least-privilege access and share incident information only with personnel who need it for response, care delivery, legal review, notification, or recovery. Team members must identify unresolved risks and hand off open actions before leaving an active response."
    ],
    bullets: [
      "Security Operations: triages alerts, determines scope, coordinates forensics, contains threats, and validates eradication.",
      "Privacy Officer: evaluates whether PHI or other regulated information was involved, coordinates risk assessment, and documents privacy determinations.",
      "IT Operations: isolates affected assets, preserves logs, applies emergency changes, restores services, and validates technical stability.",
      "Clinical Operations: activates downtime workflows, prioritizes patient-care services, communicates clinical constraints, and approves restored workflows.",
      "Legal Counsel: advises on privilege, evidence preservation, contractual duties, law enforcement, and regulatory obligations.",
      "Communications Lead: prepares approved workforce, patient, partner, media, and public messages and monitors misinformation.",
      "Human Resources: supports workforce investigations and employment actions when personnel are involved.",
      "Vendor Management: invokes contractual response obligations and coordinates third-party evidence, contacts, and restoration commitments.",
      "Executive Leadership: approves extraordinary business decisions, material public statements, and acceptance of residual operational risk."
    ]
  },
  {
    number: "6",
    title: "Reporting and Activation",
    paragraphs: [
      "Workforce members must immediately report suspected incidents through the Service Desk telephone line, security reporting mailbox, or Privacy Office. Reports should include what occurred, when it was observed, affected people or systems, actions already taken, and available screenshots or messages. Personnel must not investigate beyond their authorization, delete evidence, communicate externally, or power off affected equipment unless patient safety requires immediate action.",
      "The Service Desk creates a timestamped incident record, preserves the original report, alerts the on-call Security lead, and routes privacy-related reports to the Privacy Officer. Security acknowledges the report, performs initial validation, assigns a tracking number and preliminary severity, and notifies the Incident Commander when coordinated response criteria are met.",
      "The Incident Commander activates the required team based on severity and establishes a secure collaboration channel, incident bridge, reporting cadence, objectives, and workstream owners. Severity 1 incidents require continuous command coverage until patient-care and security risks are stabilized."
    ],
    bullets: [
      "Activation criteria include confirmed compromise, suspected regulated-data disclosure, material clinical disruption, recurring coordinated attacks, privileged-account misuse, vendor incidents affecting JCHC, or events likely to require external notification.",
      "The initial incident record must include reporter details, discovery time, known onset, affected assets, suspected data, preliminary impact, severity, assigned owners, and immediate actions.",
      "All material decisions must identify the decision maker, time, known evidence, alternatives considered, and accepted residual risk."
    ]
  },
  {
    number: "7",
    title: "Response Procedures",
    paragraphs: [
      "Response work follows the phases below, but the Incident Commander may run phases in parallel when needed to protect patients or limit harm. Responders document commands, queries, configuration changes, affected records, collected evidence, and the reason for emergency actions so another qualified person can reconstruct the response.",
      "Containment must balance security risk against patient-care continuity. When isolation could interrupt essential services, Security and Clinical Operations document a temporary alternative, compensating controls, monitoring plan, decision owner, and time for reassessment. Eradication and recovery are not considered complete until identified persistence mechanisms and exploited access paths have been addressed."
    ],
    bullets: [
      "Identification and analysis: validate the event; establish a timeline; identify affected identities, devices, applications, locations, and data; preserve volatile evidence; determine likely cause and ongoing threat activity.",
      "Containment: disable or reset compromised credentials; isolate hosts or network segments; block indicators; restrict remote access; suspend integrations; preserve clinical downtime capability.",
      "Eradication: remove malicious artifacts; close exploited vulnerabilities; revoke unauthorized persistence; rotate affected secrets; rebuild assets when integrity cannot be established.",
      "Recovery: restore from approved backups or known-good images; validate security controls and data integrity; conduct functional testing; reconnect systems in controlled stages; monitor for recurrence.",
      "Closure: confirm objectives are complete; document scope, cause, affected data, decisions, costs, notifications, residual risk, and corrective actions; obtain Incident Commander approval."
    ]
  },
  {
    number: "8",
    title: "Communications and Notification",
    paragraphs: [
      "The Incident Commander establishes the communication cadence and audience for active incidents. Operational updates identify confirmed facts, current impact, actions in progress, decisions needed, and the time of the next update. Responders use the designated secure channel and avoid including sensitive evidence in broad email distribution.",
      "The Privacy Officer determines whether affected individuals, regulators, public-health partners, business associates, or other parties require notification. Legal Counsel evaluates law-enforcement coordination, contractual obligations, preservation demands, and whether communications should be handled under privilege. The Communications Lead prepares messages and obtains approval from Legal Counsel and executive leadership before external release.",
      "Notification timing will follow applicable legal and contractual requirements. Contact details for regulators, insurers, response vendors, law enforcement, and business partners are maintained in the applicable departmental contact lists and agreements."
    ],
    bullets: [
      "Only the designated spokesperson may communicate with the media or publish incident information.",
      "Workforce notices must provide actionable instructions without exposing unnecessary investigative details.",
      "Patient and partner communications must be consistent with documented legal and privacy determinations.",
      "Copies of approved notices, recipient lists, release dates, and delivery evidence are attached to the incident record."
    ]
  },
  {
    number: "9",
    title: "Evidence Handling",
    paragraphs: [
      "Responders preserve evidence needed to determine cause, scope, data impact, responsible activity, recovery confidence, and notification obligations. Relevant evidence may include logs, alerts, system images, memory captures, messages, access records, configuration snapshots, malware samples, physical media, photographs, vendor reports, and decision notes.",
      "Each evidence entry records a unique identifier, description, collector, collection date and time, source system, method, storage location, and related incident number. Original evidence is retained when feasible, and analysis is performed on working copies. The response lead coordinates with system owners before collection activities that could affect clinical availability.",
      "Legal Counsel may initiate formal chain-of-custody procedures when litigation, employment action, regulatory inquiry, cyber-insurance, or law-enforcement involvement is anticipated. Evidence disposition requires approval from Legal Counsel and the Incident Commander."
    ],
    bullets: [
      "Do not alter original timestamps, logs, or source media unless required to prevent immediate harm.",
      "Record every transfer of evidence when formal chain of custody is active.",
      "Document unavailable or overwritten evidence and the effect on conclusions.",
      "Store forensic exports separately from general incident communications."
    ]
  },
  {
    number: "10",
    title: "Recovery and Return to Operations",
    paragraphs: [
      "Recovery priorities follow patient-safety, clinical, regulatory, and business-impact requirements established in the Business Continuity and Disaster Recovery plans. System owners prepare a restoration plan identifying dependencies, approved recovery sources, validation steps, rollback options, monitoring, and the personnel responsible for technical and clinical acceptance.",
      "IT Operations validates patching, configuration, identity controls, integrations, logging, endpoint protection, backup integrity, and expected system behavior before production use. Clinical Operations validates patient registration, scheduling, documentation, medication, ordering, result, billing, and downtime reconciliation workflows as applicable to the restored service.",
      "The Incident Commander authorizes staged reconnection and return to normal operations after receiving technical and operational approval. Enhanced monitoring remains active for a defined observation period, and any recurrence returns the incident to active response. Unresolved risks require a documented owner, mitigation, deadline, and executive acceptance."
    ],
    bullets: [
      "Restore critical clinical services before lower-priority administrative services unless the dependency plan requires a different order.",
      "Reconcile transactions and records created during downtime before declaring business recovery complete.",
      "Confirm affected users receive required password, device, or workflow instructions.",
      "Record recovery tests, approvals, exceptions, and residual risks in the incident record."
    ]
  },
  {
    number: "11",
    title: "Testing, Training, and Improvement",
    paragraphs: [
      "New workforce members receive instruction on recognizing and reporting suspected incidents. Personnel with response duties receive role-specific orientation to the incident command process, secure communication channels, evidence expectations, clinical downtime coordination, and escalation responsibilities.",
      "The Security Office may schedule tabletop exercises based on available resources, observed threats, technology changes, and leadership priorities. Exercise participants should include technical, privacy, legal, clinical, communications, and executive representatives when the scenario affects their responsibilities.",
      "Material incidents are reviewed for lessons learned. The review documents what occurred, what worked, delays, communication issues, missing information, control failures, recovery outcomes, and recommended improvements. Recommended improvements are presented to the Compliance Committee for consideration."
    ],
    bullets: [
      "Training records identify the participant, role, completion date, and course or exercise completed.",
      "Exercise and incident observations should distinguish policy gaps, process gaps, technology gaps, and training gaps.",
      "Lessons learned that affect other policies or plans are shared with the responsible document owners."
    ]
  },
  {
    number: "12",
    title: "Records Retention and Plan Review",
    paragraphs: [
      "Incident records, supporting evidence, approved communications, privacy determinations, after-action documentation, and corrective-action recommendations are retained for three years after incident closure unless Legal Counsel issues a longer hold. Access is limited to Security, Privacy, Legal, Internal Audit, and other authorized personnel with a documented business need.",
      "The Security Office reviews this plan annually and after a material incident, significant technology or organizational change, exercise identifying a plan deficiency, or relevant regulatory change. Proposed revisions are reviewed by the Privacy Officer, Legal Counsel, Clinical Operations, and IT Operations before approval by the Compliance and Risk Committee.",
      "The document owner records the version, approval date, summary of changes, and effective date in the document register. The current approved version is published to the controlled policy repository, and response team members are notified when material procedures change."
    ],
    bullets: [
      "Document owner: Chief Information Security Officer",
      "Review frequency: annually and after defined triggering events",
      "Approval authority: Compliance and Risk Committee",
      "Retention period stated by this plan: three years"
    ]
  }
];

export const DEMO_POLICY_TEXT = [
  "JOHNSON COMMUNITY HEALTH CENTER",
  "INFORMATION SECURITY INCIDENT RESPONSE PLAN",
  "Document ID: JCHC-SEC-IR-001 | Version: 3.2 | Effective: March 1, 2026",
  "Owner: Chief Information Security Officer | Classification: Internal Use",
  "Approved by: Compliance and Risk Committee",
  ...DEMO_POLICY_SECTIONS.flatMap((section) => [
    `\n${section.number}. ${section.title}`,
    ...(section.paragraphs || []),
    ...(section.bullets || []).map((item) => `- ${item}`)
  ])
].join("\n");

export function demoAssessment(_orgName = "", industry = "health-center") {
  const safeOrgName = demoOrgName(industry);
  return {
    organization_name: safeOrgName,
    document_type: "Incident Response Plan",
    document_name: DEMO_POLICY_NAME,
    entity_type: "CE",
    overall_posture: "Partially Compliant",
    compliance_score: 71,
    score_breakdown: {
      hipaa: { score: 68, controls_reviewed: 26, controls_met: 15, controls_partial: 8, controls_failed: 3 },
      nist: { score: 74, controls_reviewed: 21, controls_met: 13, controls_partial: 6, controls_failed: 2 }
    },
    posture_summary: "Johnson Community Health Center has a credible incident response structure with defined authority, severity levels, operational roles, response phases, evidence procedures, and recovery approval. The most significant gaps are incomplete regulatory notification procedures, a three-year records retention period, and the absence of a required exercise and corrective-action cadence.",
    counts: { total: 47, critical: 0, high: 2, medium: 3, low: 1 },
    findings: [
      { control_id: "164.308(a)(6)(i)", control_name: "Security incident procedures", standards: ["HIPAA"], requirement: "Implement policies and procedures to address security incidents", status: "Yes", risk_level: "High", evidence: "Section 7 defines identification and analysis, containment, eradication, recovery, and closure, and requires responders to document commands, changes, evidence, and emergency-action rationale.", finding: "The policy establishes a complete core incident-response lifecycle with operational documentation expectations." },
      { control_id: "164.308(a)(6)(ii)", control_name: "Response and reporting", standards: ["HIPAA"], requirement: "Identify, respond to, mitigate, and document security incidents", status: "Partial", risk_level: "High", evidence: "Section 6 requires immediate reporting and a timestamped incident record. Section 8 states that notification timing follows applicable legal and contractual requirements.", finding: "Internal reporting and documentation are clear, but the plan does not enumerate regulatory clocks, decision criteria, responsible external contacts, or after-hours escalation procedures." },
      { control_id: "164.316(b)(2)(i)", control_name: "Documentation retention", standards: ["HIPAA"], requirement: "Retain required HIPAA documentation for six years", status: "No", risk_level: "High", evidence: "Section 12 states that incident records and supporting documentation are retained for three years after incident closure.", finding: "The stated three-year retention period does not satisfy the six-year HIPAA documentation requirement." },
      { control_id: "IR-4", control_name: "Incident handling", standards: ["NIST"], requirement: "Implement incident handling for preparation, detection, analysis, containment, eradication, and recovery", status: "Yes", risk_level: "Critical", evidence: "Sections 4 through 10 establish classification, command authority, activation, analysis, containment, eradication, evidence handling, recovery validation, and return-to-operation approval.", finding: "The plan provides a usable handling process, cross-functional responsibilities, and clear operational authority." },
      { control_id: "IR-3", control_name: "Incident response testing", standards: ["NIST"], requirement: "Test the incident response capability at an organization-defined frequency", status: "No", risk_level: "Medium", evidence: "Section 11 says the Security Office may schedule tabletop exercises based on available resources and leadership priorities.", finding: "A mandatory exercise frequency, scenario rotation, accountable owner, completion deadline, and success criteria are not defined." },
      { control_id: "IR-6", control_name: "Incident reporting", standards: ["NIST"], requirement: "Report incident information to defined personnel and authorities within defined time periods", status: "Partial", risk_level: "Medium", evidence: "Section 6 requires immediate internal reporting and records discovery time, affected assets, impact, severity, and actions. Section 8 delegates external notification decisions without listing time limits.", finding: "Internal reporting content is well defined, but external recipients and required notification time limits are not documented in the plan." },
      { control_id: "IR-8", control_name: "Incident response plan maintenance", standards: ["NIST"], requirement: "Review, update, communicate, and protect the incident response plan", status: "Partial", risk_level: "Medium", evidence: "Section 12 requires annual and event-driven review, cross-functional approval, version recording, and notification of material changes.", finding: "Review and version control are documented, but acknowledgment by response personnel and treatment of superseded copies are not addressed." },
      { control_id: "AU-9", control_name: "Protection of audit information", standards: ["NIST"], requirement: "Protect audit information and tools from unauthorized access, modification, and deletion", status: "Partial", risk_level: "Low", evidence: "Section 9 requires unique evidence identifiers, collector and source metadata, working copies, transfer records, and separate storage of forensic exports.", finding: "Evidence collection and traceability are addressed, but technical access restrictions and integrity-validation methods for retained evidence are not defined." }
    ],
    remediation_roadmap: { phases: [
      { name: "Immediate", timeframe: "Within 30 days", color: "critical", items: [
        { number: 1, title: "Correct records retention", description: "Revise the policy and records schedule to retain required HIPAA documentation for at least six years.", references: ["164.316(b)(2)(i)"] },
        { number: 2, title: "Publish a notification matrix", description: "Document notification triggers, decision owners, regulatory clocks, external recipients, and after-hours contacts.", references: ["164.308(a)(6)(ii)", "IR-6"] }
      ] },
      { name: "Stabilize", timeframe: "31 to 60 days", color: "high", items: [
        { number: 1, title: "Establish the exercise program", description: "Set a required tabletop cadence, scenario rotation, participants, success criteria, and after-action deliverables.", references: ["IR-3"] }
      ] },
      { name: "Operationalize", timeframe: "61 to 90 days", color: "medium", items: [
        { number: 1, title: "Formalize evidence protection", description: "Define repository access controls, integrity checks, chain-of-custody triggers, and evidence review procedures.", references: ["AU-9"] },
        { number: 2, title: "Track corrective actions", description: "Assign owners and due dates to after-action items and report overdue actions to the Compliance Committee.", references: ["IR-8"] }
      ] }
    ] },
    data_handling: { message: "This fictional demonstration is rendered from bundled policy and report data in the browser. It does not upload content or call an external AI provider." },
    control_board: { citation: "HIPAA Security Rule and NIST SP 800-53 Rev. 5 demonstration control set" },
    _demo: true,
    _industry: industry
  };
}
