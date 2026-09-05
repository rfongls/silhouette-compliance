export const REPORT_PROFILES = ["customer", "internal"] as const;

export type ReportProfile = (typeof REPORT_PROFILES)[number];

export function parseReportProfile(value: string | null): ReportProfile | null {
  if (!value || value === "customer") return "customer";
  return value === "internal" ? "internal" : null;
}

export function canAccessReportProfile(profile: ReportProfile, role?: string | null) {
  return profile === "customer" || role === "admin";
}
