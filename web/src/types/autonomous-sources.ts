export type AutonomousSourceId =
  | "google-maps"
  | "google-search"
  | "bing"
  | "duckduckgo"
  | "companies-house"
  | "yell"
  | "192-com"
  | "thomson-local"
  | "freeindex"
  | "cylex-uk"
  | "touchlocal";

export type AutonomousSourceStrategy = "parallel" | "rotate" | "single";

export interface AutonomousSourceMeta {
  id: AutonomousSourceId;
  label: string;
  shortLabel: string;
  description: string;
  ukPriority?: boolean;
}

/** Fontes prioritárias para empresas UK */
export const UK_PRIORITY_SOURCES: AutonomousSourceId[] = [
  "google-maps",
  "yell",
  "companies-house",
];

export const AUTONOMOUS_SOURCE_CATALOG: AutonomousSourceMeta[] = [
  {
    id: "google-maps",
    label: "Google Maps",
    shortLabel: "Maps",
    description: "Empresas locais — fonte principal UK",
    ukPriority: true,
  },
  {
    id: "yell",
    label: "Yell.com",
    shortLabel: "Yell",
    description: "Diretório UK de negócios locais",
    ukPriority: true,
  },
  {
    id: "companies-house",
    label: "Companies House (UK)",
    shortLabel: "CH",
    description: "Registro oficial de empresas UK",
    ukPriority: true,
  },
  {
    id: "google-search",
    label: "Google Search",
    shortLabel: "Google",
    description: "Resultados web com profundidade",
  },
  {
    id: "bing",
    label: "Bing",
    shortLabel: "Bing",
    description: "Busca alternativa Microsoft",
  },
  {
    id: "duckduckgo",
    label: "DuckDuckGo",
    shortLabel: "DDG",
    description: "Busca privada complementar",
  },
  {
    id: "192-com",
    label: "192.com",
    shortLabel: "192",
    description: "Listagens de negócios UK",
  },
  {
    id: "thomson-local",
    label: "Thomson Local",
    shortLabel: "Thomson",
    description: "Diretório local britânico",
  },
  {
    id: "freeindex",
    label: "FreeIndex.co.uk",
    shortLabel: "FreeIndex",
    description: "Reviews e listagens UK",
  },
  {
    id: "cylex-uk",
    label: "Cylex UK",
    shortLabel: "Cylex",
    description: "Empresas e serviços locais UK",
  },
  {
    id: "touchlocal",
    label: "TouchLocal",
    shortLabel: "TouchLocal",
    description: "Negócios locais e contactos UK",
  },
];

export const DEFAULT_AUTONOMOUS_SOURCES: AutonomousSourceId[] = [
  ...UK_PRIORITY_SOURCES,
];

export const DEFAULT_AUTONOMOUS_SOURCE_STRATEGY: AutonomousSourceStrategy =
  "rotate";

export const DEFAULT_AUTONOMOUS_SINGLE_SOURCE: AutonomousSourceId =
  "google-maps";

const LEGACY_DEFAULT_SOURCES: AutonomousSourceId[] = [
  "google-maps",
  "google-search",
  "bing",
  "duckduckgo",
];

export function isLegacyAutonomousSources(
  sources: AutonomousSourceId[] | undefined
): boolean {
  if (!sources || sources.length !== LEGACY_DEFAULT_SOURCES.length) return false;
  return LEGACY_DEFAULT_SOURCES.every((id) => sources.includes(id));
}

export function sortSourcesByUkPriority(
  sources: AutonomousSourceId[]
): AutonomousSourceId[] {
  const priority = UK_PRIORITY_SOURCES.filter((id) => sources.includes(id));
  const rest = sources.filter((id) => !UK_PRIORITY_SOURCES.includes(id));
  return [...priority, ...rest];
}

export function sanitizeAutonomousSources(
  sources: AutonomousSourceId[] | undefined
): AutonomousSourceId[] {
  const valid = new Set(AUTONOMOUS_SOURCE_CATALOG.map((s) => s.id));
  const filtered = (sources ?? []).filter((id) => valid.has(id));
  if (filtered.length > 0) return filtered;
  return [...DEFAULT_AUTONOMOUS_SOURCES];
}

export function getSourceLabel(id: AutonomousSourceId): string {
  return (
    AUTONOMOUS_SOURCE_CATALOG.find((s) => s.id === id)?.label ?? id
  );
}

export function getSourceShortLabel(id: AutonomousSourceId): string {
  return (
    AUTONOMOUS_SOURCE_CATALOG.find((s) => s.id === id)?.shortLabel ?? id
  );
}