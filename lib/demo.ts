const demoOrgNames: Record<string, string> = {
  "health-center": "Generic Health System",
  financial: "Generic Financial Services",
  education: "Generic Education System",
  "public-sector": "Generic Public Agency",
  manufacturing: "Generic Manufacturing Company",
  retail: "Generic Retail Group"
};

export function demoOrgName(industry = "health-center") {
  return demoOrgNames[industry] || "Generic Organization";
}
