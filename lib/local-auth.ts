import type { Session } from "next-auth";

const LOCAL_AUTH_PREFIX = "COMPLIANCE_LOCAL_AUTH_";

function localAuthValue(name: string, runtimeEnv: NodeJS.ProcessEnv) {
  return String(runtimeEnv[`${LOCAL_AUTH_PREFIX}${name}`] || "").trim();
}

export function isLocalAuthBypassEnabled(runtimeEnv: NodeJS.ProcessEnv = process.env) {
  return runtimeEnv.NODE_ENV === "development" && localAuthValue("BYPASS", runtimeEnv).toLowerCase() === "true";
}

export function getLocalAuthSession(runtimeEnv: NodeJS.ProcessEnv = process.env): Session | null {
  if (!isLocalAuthBypassEnabled(runtimeEnv)) return null;

  const email = localAuthValue("EMAIL", runtimeEnv).toLowerCase() || "rfong@silhouettellc.com";
  const role = localAuthValue("ROLE", runtimeEnv).toLowerCase() === "customer" ? "customer" : "admin";
  const userId = localAuthValue("USER_ID", runtimeEnv) || "local-compliance-admin";
  const accountId = localAuthValue("ACCOUNT_ID", runtimeEnv) || "local-compliance-account";

  return {
    user: {
      id: userId,
      accountId,
      role,
      email,
      name: localAuthValue("NAME", runtimeEnv) || "Local Compliance Admin",
      image: null
    },
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  };
}
