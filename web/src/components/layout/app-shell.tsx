"use client";

import { Suspense } from "react";
import { LocalProductionBootstrap } from "@/components/providers/local-production-bootstrap";
import { SerpApiBootstrap } from "@/components/providers/serpapi-bootstrap";
import { SessionUiBootstrap } from "@/components/providers/session-ui-bootstrap";
import { DevErrorLogger } from "@/components/providers/dev-error-logger";
import { BatchPipelineIndicator } from "@/components/pipeline/batch-pipeline-indicator";
import { Sidebar } from "./sidebar";
import { Navbar } from "./navbar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <DevErrorLogger />
      <SerpApiBootstrap />
      <LocalProductionBootstrap />
      <Suspense fallback={null}>
        <SessionUiBootstrap />
      </Suspense>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar />
        <BatchPipelineIndicator />
        <main className="flex-1 overflow-y-auto p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}