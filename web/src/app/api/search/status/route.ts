import { NextRequest, NextResponse } from "next/server";
import { isSerpApiConfigured, resolveActiveProvider } from "@/lib/search/config";
import { SERPAPI_FREE_MONTHLY_LIMIT } from "@/lib/search/volume";

export async function GET(request: NextRequest) {
  const clientKey = request.nextUrl.searchParams.get("serpApiKey") ?? undefined;
  const envKeyConfigured = Boolean(process.env.SERPAPI_KEY?.trim());
  const clientKeyConfigured = Boolean(clientKey?.trim());
  const keys = clientKey ? { serpApiKey: clientKey } : undefined;
  const serpapiConfigured = isSerpApiConfigured(keys);
  const serpapiResolved = resolveActiveProvider("serpapi", keys);
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
    envHint: serpapiConfigured
      ? envKeyConfigured
        ? "SERPAPI_KEY detectada em .env.local — busca real ativa"
        : "SerpAPI configurada nas definições — busca real disponível"
      : "Adicione SERPAPI_KEY em web/.env.local ou nas configurações",
  });
}