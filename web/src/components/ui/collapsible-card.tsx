"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  type CardContentProps,
  type CardHeaderProps,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

const STORAGE_PREFIX = "pnp:card:";
const CHANGE_EVENT = "pnp:collapsible-card-change";

type CollapsibleContextValue = {
  contentId: string;
  isOpen: boolean;
  storageKey: string;
  toggle: () => void;
};

const CollapsibleContext = React.createContext<CollapsibleContextValue | null>(null);

function useCollapsibleCard() {
  const context = React.useContext(CollapsibleContext);
  if (!context) throw new Error("Collapsible card parts require CollapsibleCard.");
  return context;
}

function readStoredState(storageKey: string, defaultOpen: boolean) {
  if (typeof window === "undefined") return defaultOpen;
  try {
    const value = window.localStorage.getItem(`${STORAGE_PREFIX}${storageKey}`);
    return value === null ? defaultOpen : value === "open";
  } catch {
    return defaultOpen;
  }
}

export function CollapsibleCard({
  storageKey,
  defaultOpen = true,
  children,
  ...props
}: React.ComponentProps<typeof Card> & { storageKey: string; defaultOpen?: boolean }) {
  const contentId = React.useId();
  const subscribe = React.useCallback((onStoreChange: () => void) => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === `${STORAGE_PREFIX}${storageKey}`) onStoreChange();
    };
    const handleLocalChange = (event: Event) => {
      if ((event as CustomEvent<string>).detail === storageKey) onStoreChange();
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener(CHANGE_EVENT, handleLocalChange);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(CHANGE_EVENT, handleLocalChange);
    };
  }, [storageKey]);
  const getSnapshot = React.useCallback(
    () => readStoredState(storageKey, defaultOpen),
    [defaultOpen, storageKey]
  );
  const isOpen = React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    React.useCallback(() => defaultOpen, [defaultOpen])
  );
  const toggle = React.useCallback(() => {
    try {
      window.localStorage.setItem(
        `${STORAGE_PREFIX}${storageKey}`,
        isOpen ? "closed" : "open"
      );
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: storageKey }));
    } catch {
      // Keep the default state when browser storage is unavailable.
    }
  }, [isOpen, storageKey]);

  return (
    <CollapsibleContext.Provider value={{ contentId, isOpen, storageKey, toggle }}>
      <Card {...props}>{children}</Card>
    </CollapsibleContext.Provider>
  );
}

export function CollapsibleCardHeader({ className, children, ...props }: CardHeaderProps) {
  const { contentId, isOpen, storageKey, toggle } = useCollapsibleCard();
  return (
    <CardHeader className={cn("relative pr-16", className)} {...props}>
      {children}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-4 top-4"
        onClick={toggle}
        aria-expanded={isOpen}
        aria-controls={contentId}
        title={isOpen ? "Minimizar card" : "Reabrir card"}
        data-card-toggle={storageKey}
      >
        <ChevronDown className={cn("size-4 transition-transform duration-200", isOpen && "rotate-180")} />
        <span className="sr-only">{isOpen ? "Minimizar card" : "Reabrir card"}</span>
      </Button>
    </CardHeader>
  );
}

export function CollapsibleCardContent({ className, children, ...props }: CardContentProps) {
  const { contentId, isOpen } = useCollapsibleCard();
  return (
    <div
      id={contentId}
      aria-hidden={!isOpen}
      inert={isOpen ? undefined : true}
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-200 ease-out",
        isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      )}
    >
      <div className="min-h-0 overflow-hidden">
        <CardContent className={className} {...props}>{children}</CardContent>
      </div>
    </div>
  );
}
