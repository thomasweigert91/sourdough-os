// Nutzer-Präferenzen im Query-Cache: Laden, optimistisches Ändern, Nachreichen (F005, AC-4 bis AC-6).
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import type { Preferences, PreferencesDto, TemperatureUnit } from "@/lib/preferences";
import { useCurrentUserId } from "./hooks";
import { PREFERENCES_MUTATION_KEY, PREFERENCES_QUERY_KEY, retryDelay } from "./keys";
import { ForeignUserError, waitForSyncUser } from "./sync-user";

const PREFERENCES_URL = "/api/preferences";

export interface UpdatePreferencesVariables {
  userId: string;
  temperatureUnit: TemperatureUnit;
  /** ISO-Zeitpunkt der Änderung ("letzte Änderung gewinnt"). */
  changedAt: string;
}

async function readDto(response: Response): Promise<PreferencesDto> {
  if (!response.ok) {
    throw new Error(`Präferenzen: HTTP ${response.status}`);
  }
  return (await response.json()) as PreferencesDto;
}

export async function fetchPreferences(): Promise<PreferencesDto> {
  const response = await fetch(PREFERENCES_URL, {
    method: "GET",
    headers: { accept: "application/json" },
  });
  return readDto(response);
}

export async function putPreferences(variables: UpdatePreferencesVariables): Promise<PreferencesDto> {
  const response = await fetch(PREFERENCES_URL, {
    method: "PUT",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ temperatureUnit: variables.temperatureUnit, updatedAt: variables.changedAt }),
  });
  return readDto(response);
}

export function registerPreferencesMutation(client: QueryClient): void {
  client.setMutationDefaults<PreferencesDto, Error, UpdatePreferencesVariables>(PREFERENCES_MUTATION_KEY, {
    mutationFn: async (variables) => {
      await waitForSyncUser(variables.userId);
      return putPreferences(variables);
    },
    // Unbegrenzt wiederholen, außer die Änderung gehört zu einer anderen Person.
    retry: (_failureCount, error) => !(error instanceof ForeignUserError),
    retryDelay,
    scope: { id: "preferences" },
    networkMode: "online",
    onMutate: async (variables) => {
      await client.cancelQueries({ queryKey: PREFERENCES_QUERY_KEY });
      client.setQueryData<Preferences>(PREFERENCES_QUERY_KEY, { temperatureUnit: variables.temperatureUnit });
    },
    onSuccess: (dto) => {
      // Den Gewinner vom Server nur übernehmen, wenn keine neuere Änderung mehr wartet.
      if (client.isMutating({ mutationKey: PREFERENCES_MUTATION_KEY }) <= 1) {
        client.setQueryData<Preferences>(PREFERENCES_QUERY_KEY, { temperatureUnit: dto.temperatureUnit });
      }
    },
  });
}

export function usePreferences(): UseQueryResult<Preferences> {
  const client = useQueryClient();
  const userId = useCurrentUserId();
  return useQuery({
    queryKey: PREFERENCES_QUERY_KEY,
    enabled: Boolean(userId),
    queryFn: async (): Promise<Preferences> => {
      const dto = await fetchPreferences();
      // Lokale Änderung gewinnt, bis sie übertragen ist.
      if (client.isMutating({ mutationKey: PREFERENCES_MUTATION_KEY }) > 0) {
        const cached = client.getQueryData<Preferences>(PREFERENCES_QUERY_KEY);
        if (cached) return cached;
      }
      return { temperatureUnit: dto.temperatureUnit };
    },
  });
}

export function useUpdatePreferences(): UseMutationResult<PreferencesDto, Error, UpdatePreferencesVariables> {
  return useMutation<PreferencesDto, Error, UpdatePreferencesVariables>({
    mutationKey: PREFERENCES_MUTATION_KEY,
  });
}
