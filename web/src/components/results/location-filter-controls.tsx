"use client";

import { formatRegionHeading, resolveGeoRegion } from "@/lib/geo/regions";
import {
  DEFAULT_LOCATION_FILTER,
  type LocationFilterOptions,
} from "@/lib/location-match";

export function LocationFilterControls({
  value,
  onChange,
  requestedLocation,
}: {
  value: LocationFilterOptions;
  onChange: (next: LocationFilterOptions) => void;
  requestedLocation?: string;
}) {
  const options = value ?? DEFAULT_LOCATION_FILTER;
  const region = resolveGeoRegion(requestedLocation);
  const regionHeading = formatRegionHeading(region);
  const onlyVerified =
    options.includeVerified &&
    !options.includeLikely &&
    !options.includeUnknown &&
    !options.includeOutsideTarget;

  return (
    <div className="space-y-2 rounded-lg border border-border/60 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Localização vs. {region?.name ?? "alvo da busca"}
      </p>
      {regionHeading && (
        <p className="text-[11px] text-muted-foreground">{regionHeading}</p>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={onlyVerified}
          onChange={(event) =>
            onChange({
              includeVerified: true,
              includeLikely: !event.target.checked,
              includeUnknown: false,
              includeOutsideTarget: false,
            })
          }
        />
        Somente localização verificada
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={options.includeLikely}
          disabled={onlyVerified}
          onChange={(event) =>
            onChange({
              ...options,
              includeVerified: true,
              includeLikely: event.target.checked,
            })
          }
        />
        Incluir provável
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={options.includeUnknown}
          disabled={onlyVerified}
          onChange={(event) =>
            onChange({
              ...options,
              includeVerified: true,
              includeUnknown: event.target.checked,
            })
          }
        />
        Incluir localização desconhecida
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={options.includeOutsideTarget}
          disabled={onlyVerified}
          onChange={(event) =>
            onChange({
              ...options,
              includeOutsideTarget: event.target.checked,
            })
          }
        />
        Incluir fora da área (auditoria)
      </label>
      <p className="text-[11px] text-muted-foreground">
        Localização desconhecida fica em &quot;Revisar localização&quot; e
        não entra na campanha até ser marcada. Fora da área nunca é
        elegível; a opção acima só mostra esses registros na auditoria.
      </p>
    </div>
  );
}
