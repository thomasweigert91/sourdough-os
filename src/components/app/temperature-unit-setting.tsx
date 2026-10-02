"use client";

import { useIsRestoring } from "@tanstack/react-query";
import { TEMPERATURE_UNITS, type TemperatureUnit } from "@/lib/preferences";
import {
  PREFERENCES_LOADING_MESSAGE,
  TEMPERATURE_UNIT_LABELS,
  TEMPERATURE_UNIT_LEGEND,
} from "@/lib/offline-messages";
import { useCurrentUserId, useIsForeignCache } from "@/lib/query/hooks";
import { usePreferences, useUpdatePreferences } from "@/lib/query/preferences";

/** Auswahl der bevorzugten Temperatureinheit (°C/°F), offline änderbar (F005, AC-4, AC-5). */
export function TemperatureUnitSetting() {
  const isRestoring = useIsRestoring();
  const { data: cachedData } = usePreferences();
  const isForeignCache = useIsForeignCache();
  // Werte einer anderen Person nie anzeigen, auch nicht kurz vor dem Verwerfen.
  const data = isForeignCache ? undefined : cachedData;
  const userId = useCurrentUserId();
  const { mutate } = useUpdatePreferences();

  // Während der Wiederherstellung keine Ladeanzeige: die gespeicherten Werte folgen gleich.
  if (isRestoring) return null;

  if (!data) {
    return <p className="text-zinc-600 dark:text-zinc-400">{PREFERENCES_LOADING_MESSAGE}</p>;
  }

  function handleChange(temperatureUnit: TemperatureUnit) {
    if (!userId) return;
    mutate({ userId, temperatureUnit, changedAt: new Date().toISOString() });
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium text-zinc-950 dark:text-zinc-50">
        {TEMPERATURE_UNIT_LEGEND}
      </legend>
      {TEMPERATURE_UNITS.map((unit) => (
        <label key={unit} className="flex items-center gap-2 text-zinc-950 dark:text-zinc-50">
          <input
            type="radio"
            name="temperature-unit"
            value={unit}
            checked={data.temperatureUnit === unit}
            onChange={() => handleChange(unit)}
            className="h-4 w-4 accent-zinc-900 dark:accent-zinc-50"
          />
          {TEMPERATURE_UNIT_LABELS[unit]}
        </label>
      ))}
    </fieldset>
  );
}
