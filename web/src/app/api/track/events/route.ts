import { listTrackingEvents } from "@/lib/campaign-tracking-store.server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const campaignId = request.nextUrl.searchParams.get("campaignId") ?? undefined;
  const events = await listTrackingEvents(campaignId);
  return NextResponse.json({ events });
}