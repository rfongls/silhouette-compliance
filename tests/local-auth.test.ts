import assert from "node:assert/strict";
import test from "node:test";
import { getLocalAuthSession, isLocalAuthBypassEnabled } from "../lib/local-auth";

test("local auth bypass creates the configured development session", () => {
  const runtimeEnv = {
    NODE_ENV: "development",
    COMPLIANCE_LOCAL_AUTH_BYPASS: "true",
    COMPLIANCE_LOCAL_AUTH_EMAIL: "tester@example.com",
    COMPLIANCE_LOCAL_AUTH_ROLE: "customer",
    COMPLIANCE_LOCAL_AUTH_USER_ID: "local-user",
    COMPLIANCE_LOCAL_AUTH_ACCOUNT_ID: "local-account"
  } as NodeJS.ProcessEnv;

  assert.equal(isLocalAuthBypassEnabled(runtimeEnv), true);
  assert.deepEqual(getLocalAuthSession(runtimeEnv)?.user, {
    id: "local-user",
    accountId: "local-account",
    role: "customer",
    email: "tester@example.com",
    name: "Local Compliance Admin",
    image: null
  });
});

test("local auth bypass cannot activate in production", () => {
  const runtimeEnv = {
    NODE_ENV: "production",
    COMPLIANCE_LOCAL_AUTH_BYPASS: "true"
  } as NodeJS.ProcessEnv;

  assert.equal(isLocalAuthBypassEnabled(runtimeEnv), false);
  assert.equal(getLocalAuthSession(runtimeEnv), null);
});

test("local auth bypass is opt-in during development", () => {
  const runtimeEnv = { NODE_ENV: "development" } as NodeJS.ProcessEnv;

  assert.equal(isLocalAuthBypassEnabled(runtimeEnv), false);
  assert.equal(getLocalAuthSession(runtimeEnv), null);
});
