import { NextResponse } from "next/server";
import { requestEarlyAccessNotification } from "@/lib/early-access";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { interestId?: unknown } | null;
  const interestId = typeof body?.interestId === "string" ? body.interestId.trim() : "";

  if (!interestId || interestId.length > 64) {
    return NextResponse.json({ error: "Invalid waitlist request." }, { status: 400 });
  }

  const result = await requestEarlyAccessNotification(interestId);
  if (!result.count) {
    return NextResponse.json({ error: "Waitlist record not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
