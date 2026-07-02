"use client";

import { useLocalProduction } from "@/hooks/use-local-production";

export function LocalProductionBootstrap() {
  useLocalProduction();
  return null;
}