import type { Metadata } from "next";
import { ToastProvider } from "@/components/providers/toast-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  title: "P&P Lead Finder | Panek Pugliesi",
  description:
    "Plataforma Inteligente de Prospecção B2B com IA — Panek Pugliesi",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="dark h-full antialiased">
      <body className="min-h-full">
        <TooltipProvider>
          {children}
          <ToastProvider />
        </TooltipProvider>
      </body>
    </html>
  );
}