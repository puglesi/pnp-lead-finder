import { recordTrackingEvent } from "@/lib/campaign-tracking-store.server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      campaignId?: string;
      leadId?: string;
      email?: string;
      source?: "manual" | "simulated";
    };

    const { campaignId, leadId, email } = body;
    if (!campaignId || !leadId || !email) {
      return NextResponse.json(
        { error: "campaignId, leadId e email são obrigatórios" },
        { status: 400 }
      );
    }

    const event = await recordTrackingEvent({
      campaignId,
      leadId,
      email,
      type: "reply",
      source: body.source ?? "manual",
    });

    return NextResponse.json({ success: true, event });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}