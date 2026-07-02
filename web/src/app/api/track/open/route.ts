import { decodeTrackingToken } from "@/lib/campaign-tracking";
import { recordTrackingEvent } from "@/lib/campaign-tracking-store.server";
import { NextRequest, NextResponse } from "next/server";

const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("t");

  if (token) {
    const payload = decodeTrackingToken(token);
    if (payload) {
      await recordTrackingEvent({
        campaignId: payload.campaignId,
        leadId: payload.leadId,
        email: payload.email,
        type: "open",
        source: "pixel",
        userAgent: request.headers.get("user-agent") ?? undefined,
      });
    }
  }

  return new NextResponse(TRANSPARENT_GIF, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
    },
  });
}