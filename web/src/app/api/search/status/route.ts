import { NextResponse } from "next/server";
import { isSerpApiConfigured, resolveActiveProvider } from "@/lib/search/config";
import { SERPAPI_FREE_MONTHLY_LIMIT } from "@/lib/search/volume";

export async function GET() {
  const envKeyConfigured = Boolean(process.env.SERPAPI_KEY?.trim());
  const clientKeyConfigured = false;
  const serpapiConfigured = isSerpApiConfigured();
  const serpapiResolved = resolveActiveProvider("serpapi");
  const autonomousResolved = resolveActiveProvider("autonomous");

  const keySource: "env" | "client" | "both" | "none" =
    envKeyConfigured && clientKeyConfigured
      ? "both"
      : envKeyConfigured
        ? "env"
        : clientKeyConfigured
          ? "client"
          : "none";

  return NextResponse.json({
    serpapiConfigured,
    envKeyConfigured,
    clientKeyConfigured,
    keySource,
    monthlyLimit: SERPAPI_FREE_MONTHLY_LIMIT,
    providers: {
      autonomous: {
        available: true,
        isLive: autonomousResolved.isLive,
        label: "Scraping 24h",
      },
      serpapi: {
        available: true,
        isLive: serpapiResolved.isLive,
        label: serpapiResolved.isLive
          ? "SerpAPI Live"
          : "SerpAPI (fallback automático)",
        reason: serpapiResolved.reason,
      },
    },
    envHint: envKeyConfigured
      ? "SERPAPI_KEY detectada em .env.local — busca real ativa"
      : "Adicione SERPAPI_KEY em web/.env.local. O browser não envia chaves.",
  });
}