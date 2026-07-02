import { decodeTrackingToken } from "@/lib/campaign-tracking";
import { recordTrackingEvent } from "@/lib/campaign-tracking-store.server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("t");
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "URL ausente" }, { status: 400 });
  }

  let target: string;
  try {
    target = decodeURIComponent(url);
  } catch {
    return NextResponse.json({ error: "URL inválida" }, { status: 400 });
  }

  if (!/^https?:\/\//i.test(target)) {
    return NextResponse.json({ error: "URL não permitida" }, { status: 400 });
  }

  if (token) {
    const payload = decodeTrackingToken(token);
    if (payload) {
      await recordTrackingEvent({
        campaignId: payload.campaignId,
        leadId: payload.leadId,
        email: payload.email,
        type: "click",
        url: target,
        source: "link",
        userAgent: request.headers.get("user-agent") ?? undefined,
      });
    }
  }

  return NextResponse.redirect(target, 302);
}