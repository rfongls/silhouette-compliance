import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export async function sendIrpCompletionEmail(quoteId: string) {
  const quote = await prisma.runQuote.findUnique({ where: { id: quoteId } });
  if (!quote) return { status: "NOT_FOUND" };
  if (!quote.reportRecipient || quote.reportEmailStatus === "DISABLED") return { status: "DISABLED" };
  if (quote.reportEmailStatus === "SENT") return { status: "SENT", id: quote.reportEmailId };

  const apiKey = env("RESEND_API_KEY");
  const from = env("REPORT_EMAIL_FROM");
  if (!apiKey || !from) {
    await prisma.runQuote.update({
      where: { id: quoteId },
      data: { reportEmailStatus: "NOT_CONFIGURED", reportEmailError: "Report email provider is not configured." }
    });
    return { status: "NOT_CONFIGURED" };
  }

  const baseUrl = (env("APP_BASE_URL") || env("NEXTAUTH_URL", "http://localhost:3000")).replace(/\/$/, "");
  const reportUrl = `${baseUrl}/app/irp/reports/${encodeURIComponent(quote.id)}`;
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#17131f;line-height:1.5"><h1>Your IRP assessment is ready</h1><p>Your confirmed Silhouette Compliance assessment has finished.</p><p><a href="${reportUrl}">Sign in to view and export your reports</a></p><p style="color:#6b7280;font-size:12px">For privacy, assessment findings and uploaded policy documents are not included in this email.</p></body></html>`;

  await prisma.runQuote.update({ where: { id: quoteId }, data: { reportEmailStatus: "SENDING", reportEmailError: null } });
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `irp-completion/${quoteId}`
      },
      body: JSON.stringify({
        from,
        to: [quote.reportRecipient],
        subject: "Your IRP assessment is ready",
        html
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.id) throw new Error(`Report email provider returned ${response.status}.`);
    await prisma.runQuote.update({
      where: { id: quoteId },
      data: { reportEmailStatus: "SENT", reportEmailId: String(result.id), reportEmailSentAt: new Date(), reportEmailError: null }
    });
    return { status: "SENT", id: String(result.id) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Report email delivery failed.";
    await prisma.runQuote.update({ where: { id: quoteId }, data: { reportEmailStatus: "FAILED", reportEmailError: message } });
    return { status: "FAILED", error: message };
  }
}
