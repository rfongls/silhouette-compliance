import { env, envList } from "@/lib/env";

const ownerEmails = new Set(["twisty808@gmail.com", "rfong@silhouettellc.com"]);

function normalizeEmail(email?: string | null) {
  return String(email || "").trim().toLowerCase();
}

export function getGitHubLogin(account?: { provider?: string } | null, profile?: unknown) {
  if (account?.provider !== "github") return "";
  return typeof profile === "object" && profile && "login" in profile
    ? String((profile as { login?: unknown }).login || "").toLowerCase()
    : "";
}

export function isOwnerOnlyLockdownEnabled() {
  const defaultValue = process.env.NODE_ENV === "production" ? "true" : "false";
  return env("OWNER_ONLY_LOCKDOWN", defaultValue).toLowerCase() !== "false";
}

export function isComplianceEmailAllowed(email?: string | null) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return false;
  if (ownerEmails.has(normalizedEmail)) return true;
  if (isOwnerOnlyLockdownEnabled()) return false;

  const allowedEmails = envList("ALLOWED_EMAILS");
  const allowedGitHubLogins = envList("ALLOWED_GITHUB_LOGINS");
  if (!allowedEmails.size && !allowedGitHubLogins.size) return process.env.NODE_ENV !== "production";
  return allowedEmails.has(normalizedEmail);
}

export function isComplianceUserAllowed(
  user: { email?: string | null },
  account?: { provider?: string } | null,
  profile?: unknown
) {
  const email = normalizeEmail(user.email);
  if (email && ownerEmails.has(email)) return true;
  if (isOwnerOnlyLockdownEnabled()) return false;

  const allowedEmails = envList("ALLOWED_EMAILS");
  const allowedGitHubLogins = envList("ALLOWED_GITHUB_LOGINS");
  if (!allowedEmails.size && !allowedGitHubLogins.size) return process.env.NODE_ENV !== "production";
  if (email && allowedEmails.has(email)) return true;
  const login = getGitHubLogin(account, profile);
  return Boolean(login && allowedGitHubLogins.has(login));
}
