import { Suspense } from "react";
import { NovaCampanhaContent } from "./nova-campanha-content";

export default function NovaCampanhaPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl animate-pulse space-y-6">
          <div className="h-10 w-64 rounded-lg bg-muted" />
          <div className="h-96 rounded-xl bg-muted" />
        </div>
      }
    >
      <NovaCampanhaContent />
    </Suspense>
  );
}