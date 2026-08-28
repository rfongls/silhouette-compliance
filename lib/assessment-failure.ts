export type AssessmentFailureDetails = {
  failureProvider?: string | null;
  failureHttpStatus?: number | null;
  failureCode?: string | null;
  failureRequestId?: string | null;
  failureRetriable?: boolean | null;
  failureAttempts?: number | null;
  failureStage?: string | null;
};

function providerName(provider?: string | null) {
  if (!provider) return "The assessment service";
  if (provider.toLowerCase() === "openai") return "OpenAI";
  if (provider.toLowerCase() === "anthropic") return "Anthropic";
  return "The assessment service";
}

export function assessmentFailureReason(details: AssessmentFailureDetails) {
  const provider = providerName(details.failureProvider);
  const code = (details.failureCode || "").toLowerCase();
  const status = details.failureHttpStatus || 0;

  if (code === "credit_balance_exhausted" || code === "insufficient_quota") {
    return `${provider} account balance is exhausted. An administrator must restore provider credits before this assessment can continue.`;
  }
  if (status === 401 || code === "invalid_api_key") {
    return `${provider} rejected the configured API key. An administrator must replace and verify the key before retrying.`;
  }
  if (status === 403) {
    return `${provider} denied the assessment request. An administrator must verify project permissions and model access.`;
  }
  if (status === 429) {
    return `${provider} temporarily rate-limited the assessment. Retry after the provider limit resets.`;
  }
  if (code === "invalid_json_response" || code === "missing_output_text" || details.failureStage === "provider_response") {
    return `${provider} returned an incomplete or invalid response. The assessment can be retried without changing the uploaded policy.`;
  }
  if (status >= 500) {
    return `${provider} was temporarily unavailable. The assessment can be retried after service is restored.`;
  }
  if (details.failureStage === "result_validation") {
    return "The generated assessment did not pass report validation. The assessment can be retried without changing the uploaded policy.";
  }
  return "Assessment processing failed before the report could be completed.";
}

export function assessmentFailureSupport(details: AssessmentFailureDetails) {
  const parts: string[] = [];
  if (details.failureAttempts) parts.push(`${details.failureAttempts} attempt${details.failureAttempts === 1 ? "" : "s"}`);
  if (details.failureRequestId) parts.push(`Support reference ${details.failureRequestId}`);
  return parts.join(" | ");
}
