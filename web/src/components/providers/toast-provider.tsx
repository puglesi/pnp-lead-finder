"use client";

import { Toaster } from "react-hot-toast";

export function ToastProvider() {
  return (
    <Toaster
      position="top-right"
      gutter={12}
      toastOptions={{
        duration: 3500,
        style: {
          background: "hsl(222 47% 9%)",
          color: "hsl(210 40% 98%)",
          border: "1px solid hsl(217 33% 20%)",
          borderRadius: "10px",
          padding: "12px 16px",
          fontSize: "14px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px hsl(217 91% 60% / 0.1)",
        },
        success: {
          iconTheme: {
            primary: "#10b981",
            secondary: "hsl(222 47% 9%)",
          },
          style: {
            borderColor: "hsl(160 84% 39% / 0.3)",
          },
        },
        error: {
          iconTheme: {
            primary: "#ef4444",
            secondary: "hsl(222 47% 9%)",
          },
          style: {
            borderColor: "hsl(0 84% 60% / 0.3)",
          },
        },
      }}
    />
  );
}