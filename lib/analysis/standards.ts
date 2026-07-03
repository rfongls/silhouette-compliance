export type StandardDef = { key: string; label: string; default: boolean };
export type IndustryDef = { label: string; standards: StandardDef[] };

export const INDUSTRY_STANDARDS: Record<string, IndustryDef> = {
  "health-center": {
    label: "Health Center / Healthcare",
    standards: [
      { key: "NIST", label: "NIST SP 800-53 Rev. 5", default: true },
      { key: "HIPAA", label: "HIPAA Security / Privacy", default: true },
      { key: "HITECH", label: "HITECH", default: true },
      { key: "EP", label: "CMS Emergency Preparedness", default: false },
      { key: "CSF", label: "NIST CSF 2.0", default: false },
      { key: "SP80066", label: "NIST SP 800-66 Rev. 2", default: false }
    ]
  },
  financial: { label: "Financial Services", standards: [
    { key: "GLBA", label: "GLBA Safeguards Rule", default: true }, { key: "NYDFS", label: "NYDFS 23 NYCRR 500", default: true }, { key: "SOX", label: "SOX / ITGC", default: false }, { key: "SOC2", label: "SOC 2", default: false }, { key: "ISO27001", label: "ISO/IEC 27001:2022", default: false }
  ] },
  education: { label: "Education", standards: [
    { key: "FERPA", label: "FERPA", default: true }, { key: "GLBA", label: "GLBA Safeguards", default: true }, { key: "COPPA", label: "COPPA", default: false }, { key: "NIST171", label: "NIST SP 800-171", default: false }, { key: "CSF", label: "NIST CSF 2.0", default: false }
  ] },
  "public-sector": { label: "Public Sector / Government", standards: [
    { key: "FISMA", label: "FISMA / NIST RMF", default: true }, { key: "NIST171", label: "NIST SP 800-171", default: true }, { key: "CMMC", label: "CMMC 2.0", default: false }, { key: "CJIS", label: "CJIS", default: false }, { key: "CSF", label: "NIST CSF 2.0", default: false }
  ] },
  manufacturing: { label: "Manufacturing / OT", standards: [
    { key: "IEC62443", label: "IEC 62443", default: true }, { key: "NIST82", label: "NIST SP 800-82", default: true }, { key: "NIST171", label: "NIST SP 800-171", default: false }, { key: "NERCCIP", label: "NERC CIP", default: false }, { key: "CSF", label: "NIST CSF 2.0", default: false }
  ] },
  retail: { label: "Retail / E-commerce", standards: [
    { key: "PCIDSS", label: "PCI DSS 4.0.1", default: true }, { key: "CCPA", label: "CCPA / CPRA", default: true }, { key: "SOC2", label: "SOC 2", default: false }, { key: "ISO27001", label: "ISO/IEC 27001:2022", default: false }, { key: "CSF", label: "NIST CSF 2.0", default: false }
  ] }
};

export function defaultStandards(industry: string) {
  return (INDUSTRY_STANDARDS[industry]?.standards ?? INDUSTRY_STANDARDS["health-center"].standards).filter((s) => s.default).map((s) => s.key);
}

export function standardLabels(industry: string, standards: string[]) {
  const defs = INDUSTRY_STANDARDS[industry]?.standards ?? [];
  const labels = new Map(defs.map((s) => [s.key, s.label]));
  return standards.map((s) => labels.get(s) ?? s);
}
