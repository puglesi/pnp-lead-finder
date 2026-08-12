import type { Metadata } from "next";
import Script from "next/script";
import { ToastProvider } from "@/components/providers/toast-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  title: "P&P Lead Finder | Panek Pugliesi",
  description:
    "Plataforma Inteligente de Prospecção B2B com IA — Panek Pugliesi",
};

/** Runs before hydration to apply light/dark/system without flash. */
const themeBootScript = `
(function(){
  try {
    var raw = localStorage.getItem('pnp-theme');
    var pref = 'system';
    if (raw) {
      var parsed = JSON.parse(raw);
      if (parsed && parsed.state && parsed.state.preference) pref = parsed.state.preference;
    }
    var dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = pref === 'light' ? 'light' : pref === 'dark' ? 'dark' : (dark ? 'dark' : 'light');
    var root = document.documentElement;
    root.classList.remove('light','dark');
    root.classList.add(theme);
    root.style.colorScheme = theme;
    root.dataset.theme = theme;
  } catch (e) {
    document.documentElement.classList.add('dark');
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full">
        <Script
          id="pnp-theme-boot"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeBootScript }}
        />
        <ThemeProvider>
          <TooltipProvider>
            {children}
            <ToastProvider />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}