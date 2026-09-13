"use client";
import { useEffect, useState } from "react";
type Health = {
  workerOnline: boolean; workerMode: string; sqliteOk: boolean; dbBytes: number; walBytes: number; shmBytes: number; lastBackup: string | null;
  workers: { heartbeat_at: string; state: string; last_error: string | null }[];
  activeRunners: { operation_id: string; heartbeat_at: string }[];
  queues: { operation: string; campaign: string | null; counts: Record<string, number> }[];
  smtpCooldowns: { operation: string; until_at: string | null; paused: number; classification: string }[];
};
export default function OperationalHealthPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState(false);
  const [controlMessage, setControlMessage] = useState("");
  async function control(operation: string, desiredState: string) {
    try {
      const response = await fetch("/api/worker-control", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation, desiredState }) });
      setControlMessage(response.ok ? "Comando recebido pelo worker." : "Comando bloqueado. Verifique reconciliação, fila e cooldown.");
    } catch { setControlMessage("Worker indisponível."); }
  }
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const response = await fetch("/api/operational-health", { cache: "no-store" });
        if (!response.ok) throw new Error("unavailable");
        const next = await response.json();
        if (!cancelled) { setHealth(next); setError(false); }
      } catch { if (!cancelled) setError(true); }
    };
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 15_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);
  return <main className="mx-auto max-w-4xl space-y-5 p-6">
    <h1 className="text-2xl font-semibold">Operação 24/7</h1>
    {error && <p role="alert">Status indisponível. Verifique o servidor local.</p>}
    {!health ? <p>Aguardando status…</p> : <>
      <p>Worker: {health.workerOnline ? "online" : "offline"} · SQLite: {health.sqliteOk ? "OK" : "falha"}</p>
      <p>Modo: {health.workerMode === "monitor" ? "monitoramento" : "execução"}</p>
      <div className="space-y-2">{["agent-1", "agent-2", "panek-puglesi", "modeclean"].map(operation => <div key={operation} className="flex items-center gap-3">
        <span>{operation}</span><button className="rounded border px-3 py-1 disabled:opacity-40" disabled={!health.workerOnline || health.workerMode !== "execute"} onClick={() => { void control(operation, "running"); }}>Iniciar</button>
        <button className="rounded border px-3 py-1 disabled:opacity-40" disabled={!health.workerOnline || health.workerMode !== "execute"} onClick={() => { void control(operation, "paused"); }}>Pausar</button>
      </div>)}</div><p role="status">{controlMessage}</p>
      <p>DB: {health.dbBytes.toLocaleString()} bytes · WAL: {health.walBytes.toLocaleString()} bytes · SHM: {health.shmBytes.toLocaleString()} bytes</p>
      <p>Último backup: {health.lastBackup ?? "não registrado"}</p>
      {health.workers.slice(0, 1).map(worker => <p key={worker.heartbeat_at}>Heartbeat: {worker.heartbeat_at} · Último erro: {worker.last_error ?? "nenhum"}</p>)}
      <h2 className="text-lg font-medium">Runners ativos</h2>
      {health.activeRunners.map(runner => <p key={runner.operation_id}>{runner.operation_id} · {runner.heartbeat_at}</p>)}
      <h2 className="text-lg font-medium">Filas</h2>
      {health.queues.map(queue => <div key={queue.operation} className="rounded border p-3"><p>{queue.operation} · Campanha: {queue.campaign ?? "nenhuma"}</p>
        <p>{Object.entries(queue.counts).map(([status, count]) => `${status}: ${count}`).join(" · ")}</p></div>)}
      <h2 className="text-lg font-medium">SMTP cooldown</h2>
      {health.smtpCooldowns.length === 0 && <p>Nenhum cooldown.</p>}
      {health.smtpCooldowns.map((cooldown, index) => <p key={index}>{cooldown.operation} · {cooldown.classification} · {cooldown.paused ? "pausado: revisão manual" : cooldown.until_at ?? "liberado"}</p>)}
    </>}
  </main>;
}
