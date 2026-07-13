const prefix = "COMPLIANCE_";

export function env(name: string, fallback = "") {
  return process.env[`${prefix}${name}`] || process.env[name] || fallback;
}

export function hasEnvPair(first: string, second: string) {
  return Boolean(env(first) && env(second));
}

export function envList(name: string) {
  return new Set(env(name).split(",").map((value) => value.trim().toLowerCase()).filter(Boolean));
}

export function bootstrapComplianceEnv() {
  const names = [
    "DATABASE_URL",
    "NEXTAUTH_URL",
    "NEXTAUTH_SECRET",
    "AUTH_URL",
    "AUTH_SECRET",
    "APP_BASE_URL",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GITHUB_CLIENT_ID",
    "GITHUB_CLIENT_SECRET",
    "MICROSOFT_ENTRA_ID_CLIENT_ID",
    "MICROSOFT_ENTRA_ID_CLIENT_SECRET",
    "MICROSOFT_ENTRA_ID_ISSUER",
    "ADMIN_EMAILS",
    "ADMIN_GITHUB_LOGINS",
    "ALLOWED_EMAILS",
    "ALLOWED_GITHUB_LOGINS"
  ];

  for (const name of names) {
    process.env[name] ||= process.env[`${prefix}${name}`];
  }

  process.env.AUTH_URL ||= env("NEXTAUTH_URL");
  process.env.AUTH_SECRET ||= env("NEXTAUTH_SECRET");
}
