import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import {
  importPortableIrpReport,
  IRP_REPORT_IMPORT_MAX_BYTES,
  parsePortableIrpReport,
  ReportImportError
} from "@/lib/report-import";

export async function POST(request: Request) {
  const guard = await requireSession("customer");
  if ("response" in guard) return guard.response;

  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > IRP_REPORT_IMPORT_MAX_BYTES) {
      throw new ReportImportError("The report package exceeds the 10 MB import limit.");
    }
    const report = parsePortableIrpReport(await request.text());
    const imported = await prisma.$transaction((tx) => importPortableIrpReport(tx, guard.session.user.accountId, report));
    return NextResponse.json(imported, { status: imported.duplicate ? 200 : 201 });
  } catch (error) {
    if (error instanceof ReportImportError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("Report import failed", error);
    return NextResponse.json({ error: "The report could not be imported." }, { status: 500 });
  }
}
