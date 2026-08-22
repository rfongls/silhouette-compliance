import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { extractPolicyPdfText, MAX_POLICY_PDF_BYTES, PolicyDocumentError } from "@/lib/policy-documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const guard = await requireSession("customer");
  if ("response" in guard) return guard.response;

  try {
    const form = await req.formData();
    const value = form.get("file");
    if (!value || typeof value === "string" || typeof value.arrayBuffer !== "function") {
      return NextResponse.json({ error: "Select one PDF policy document." }, { status: 400 });
    }
    const filename = String(value.name || "policy.pdf");
    const isPdf = value.type === "application/pdf" || filename.toLocaleLowerCase().endsWith(".pdf");
    if (!isPdf) return NextResponse.json({ error: "Only PDF documents are accepted by this extraction endpoint." }, { status: 415 });
    if (value.size > MAX_POLICY_PDF_BYTES) {
      return NextResponse.json({ error: `PDF files may not exceed ${Math.floor(MAX_POLICY_PDF_BYTES / 1_000_000)} MB.` }, { status: 413 });
    }

    const { text, pages } = await extractPolicyPdfText(Buffer.from(await value.arrayBuffer()));
    return NextResponse.json(
      { filename, text, characters: text.length, pages },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof PolicyDocumentError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "The PDF could not be converted to policy text." }, { status: 422 });
  }
}
