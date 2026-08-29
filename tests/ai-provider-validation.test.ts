import assert from "node:assert/strict";
import test from "node:test";
import { AIKeyVerificationError, verifyAIKey, verifyAIProviderReadiness } from "../lib/ai-provider-validation";
import { AIProviderRequestError, isRetriableProviderFailure, providerFailureEvidence } from "../lib/analysis/anthropic";
import { assessmentFailureReason, assessmentFailureSupport } from "../lib/assessment-failure";

test("OpenAI verification uses the authenticated models endpoint", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://api.openai.com/v1/models");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer test-key");
    return new Response(JSON.stringify({ object: "list", data: [] }), { status: 200 });
  };

  const result = await verifyAIKey({ provider: "openai", apiKey: " test-key " });
  assert.ok(result.verifiedAt);
});

test("provider failures do not expose response bodies or credential fragments", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response(JSON.stringify({
    error: { message: "Incorrect API key provided: sensitive-key-fragment" }
  }), { status: 401 });

  await assert.rejects(
    verifyAIKey({ provider: "openai", apiKey: "sensitive-key-fragment" }),
    (error: unknown) => {
      assert.ok(error instanceof AIKeyVerificationError);
      assert.match(error.message, /rejected the API key/);
      assert.doesNotMatch(error.message, /sensitive-key-fragment/);
      return true;
    }
  );
});

test("OpenAI operational readiness makes a minimal stateless model request", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://api.openai.com/v1/responses");
    assert.equal(init?.method, "POST");
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body, { model: "gpt-test", store: false, input: "Reply with OK.", max_output_tokens: 16 });
    return new Response(JSON.stringify({ output_text: "OK" }), { status: 200 });
  };

  const result = await verifyAIProviderReadiness({ provider: "openai", apiKey: "test-key", model: "gpt-test" });
  assert.ok(result.verifiedAt);
});

test("OpenAI operational readiness reports exhausted billing without exposing provider text", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response(JSON.stringify({
    error: { code: "credit_balance_exhausted", message: "private provider detail" }
  }), { status: 429 });

  await assert.rejects(
    verifyAIProviderReadiness({ provider: "openai", apiKey: "test-key", model: "gpt-test" }),
    (error: unknown) => {
      assert.ok(error instanceof AIKeyVerificationError);
      assert.match(error.message, /account balance is exhausted/i);
      assert.doesNotMatch(error.message, /private provider detail/);
      return true;
    }
  );
});

test("provider failure evidence contains support identifiers without source content", () => {
  const error = new AIProviderRequestError("OpenAI", {
    provider: "openai",
    model: "gpt-test",
    httpStatus: 500,
    code: "server_error",
    requestId: "req_support_123",
    retriable: true,
    attempts: 3,
    stage: "provider_request"
  });
  assert.deepEqual(providerFailureEvidence(error), {
    provider: "openai",
    model: "gpt-test",
    httpStatus: 500,
    code: "server_error",
    requestId: "req_support_123",
    retriable: true,
    attempts: 3,
    stage: "provider_request"
  });
  assert.doesNotMatch(error.message, /policy|api key/i);
});

test("provider quota exhaustion is actionable and is not retried", () => {
  assert.equal(isRetriableProviderFailure(429, "credit_balance_exhausted"), false);
  assert.equal(isRetriableProviderFailure(429, "rate_limit_exceeded"), true);
  const failure = {
    failureProvider: "openai",
    failureHttpStatus: 429,
    failureCode: "credit_balance_exhausted",
    failureRequestId: "req_support_456",
    failureRetriable: false,
    failureAttempts: 1,
    failureStage: "provider_request"
  };
  assert.match(assessmentFailureReason(failure), /account balance is exhausted/i);
  assert.equal(assessmentFailureSupport(failure), "1 attempt | Support reference req_support_456");
});
