import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";

export async function POST() {
  const guard = await requireSession("customer");
  if ("response" in guard) return guard.response;
  return NextResponse.json({
    error: "Free-form AI refinement is disabled because it could change a control score without the original evidence and control set. Use the control-level review workflow instead."
  }, { status: 409 });
}
