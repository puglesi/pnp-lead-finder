"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  name: string;
  children: ReactNode;
  /** Compact fallback for production resilience. */
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Isolates a Dashboard section so one malformed historical payload
 * cannot take down the entire page. Logs stack in development only.
 */
export class DashboardSectionBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (process.env.NODE_ENV === "production") return;
    const stack = (error.stack ?? "")
      .split("\n")
      .slice(0, 10)
      .map((l) => l.trim())
      .join(" | ");
    console.error(
      `[Dashboard section: ${this.props.name}]`,
      error.name,
      error.message,
      stack ? `\n${stack}` : "",
      info.componentStack
        ? `\ncomponentStack: ${info.componentStack
            .split("\n")
            .slice(0, 6)
            .map((l) => l.trim())
            .join(" | ")}`
        : ""
    );
  }

  render() {
    if (!this.state.error) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    const isDev = process.env.NODE_ENV !== "production";
    return (
      <div
        role="alert"
        className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-50"
        data-dashboard-section-error={this.props.name}
      >
        <p className="font-medium">
          Falha na seção: {this.props.name}
        </p>
        {isDev && (
          <p className="mt-1 font-mono text-[11px] opacity-80">
            {this.state.error.name}: {this.state.error.message}
          </p>
        )}
        <button
          type="button"
          className="mt-2 text-xs font-medium underline underline-offset-2"
          onClick={() => this.setState({ error: null })}
        >
          Tentar de novo
        </button>
      </div>
    );
  }
}
