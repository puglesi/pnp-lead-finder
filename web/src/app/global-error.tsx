"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isDev = process.env.NODE_ENV !== "production";
  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: "system-ui", padding: 32, background: "#0b1220", color: "#e2e8f0" }}>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>
          Erro global da aplicação
        </h1>
        <p style={{ opacity: 0.8, marginBottom: 16 }}>
          Dados salvos não foram apagados. Use o botão abaixo para tentar de novo.
        </p>
        {isDev && (
          <pre
            style={{
              background: "#1e293b",
              padding: 16,
              borderRadius: 8,
              overflow: "auto",
              fontSize: 12,
              marginBottom: 16,
            }}
          >
            {error.name}: {error.message}
            {"\n"}
            {(error.stack ?? "").split("\n").slice(0, 12).join("\n")}
          </pre>
        )}
        <button
          type="button"
          onClick={() => reset()}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "none",
            background: "#3b82f6",
            color: "white",
            cursor: "pointer",
          }}
        >
          Tentar novamente
        </button>
      </body>
    </html>
  );
}
