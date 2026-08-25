import assert from "node:assert/strict";
import test from "node:test";
import { AIKeyVerificationError, verifyAIKey } from "../lib/ai-provider-validation";
import { AIProviderRequestError, providerFailureEvidence } from "../lib/analysis/anthropic";

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
