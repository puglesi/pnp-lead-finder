"use client";

import { useEffect, useRef } from "react";
import toast from "react-hot-toast";
import { fetchSerpApiStatus } from "@/hooks/use-serpapi-status";
import { useSettingsStore } from "@/store/settings-store";

export function SerpApiBootstrap() {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    fetchSerpApiStatus()
      .then((status) => {
        if (!status.serpapiConfigured) return;

        const store = useSettingsStore.getState();
        if (store.profileUserOverride) return;

        if (store.searchProfile !== "serpapi") {
          const source = status.envKeyConfigured
            ? ".env.local"
            : "configurações";
          toast(
            `SerpAPI detectada (${source}) — disponível como Premium nas Configurações`,
            { icon: "⚡", duration: 5000 }
          );
        }
      })
      .catch(() => {});
  }, []);

  return null;
}