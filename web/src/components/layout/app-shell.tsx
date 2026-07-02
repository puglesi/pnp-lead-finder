"use client";

import { LocalProductionBootstrap } from "@/components/providers/local-production-bootstrap";
import { SerpApiBootstrap } from "@/components/providers/serpapi-bootstrap";
import { Sidebar } from "./sidebar";
import { Navbar } from "./navbar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <SerpApiBootstrap />
      <LocalProductionBootstrap />
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar />
        <main className="flex-1 overflow-y-auto p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}