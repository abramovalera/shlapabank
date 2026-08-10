import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";

/** Флаги стенда. Часть багов живёт на клиенте — фронт узнаёт о режиме через /flags. */
export interface FeatureFlags {
  bugs_enabled: boolean;
  chaos_enabled: boolean;
  dev_trace_enabled: boolean;
}

export function useFlags() {
  return useQuery({
    queryKey: ["flags"],
    queryFn: async (): Promise<FeatureFlags> => (await api.get("/flags")).data,
    staleTime: 30_000,
  });
}

/** Удобный шорткат: включён ли режим багов (для клиентских дефектов). */
export function useBugsEnabled(): boolean {
  return useFlags().data?.bugs_enabled ?? false;
}
