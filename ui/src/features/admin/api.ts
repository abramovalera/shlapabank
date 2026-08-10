import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";

/** Профиль искусственных задержек API (chaos). Меняется только `enabled`. */
export interface ChaosConfig {
  enabled: boolean;
  base_min_ms: number;
  base_max_ms: number;
  heavy_min_ms: number;
  heavy_max_ms: number;
  tail_probability: number;
  tail_min_ms: number;
  tail_max_ms: number;
}

export function useChaosConfig() {
  return useQuery({
    queryKey: ["admin", "chaos"],
    queryFn: async (): Promise<ChaosConfig> => (await api.get("/admin/chaos")).data,
  });
}

export function useSetChaos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (enabled: boolean): Promise<ChaosConfig> =>
      (await api.put("/admin/chaos", { enabled })).data,
    onSuccess: (data) => {
      qc.setQueryData(["admin", "chaos"], data);
    },
  });
}

/** Режим намеренных багов («найди баг»). */
export interface BugsConfig {
  enabled: boolean;
  count: number;
}

export function useBugsConfig() {
  return useQuery({
    queryKey: ["admin", "bugs"],
    queryFn: async (): Promise<BugsConfig> => (await api.get("/admin/bugs")).data,
  });
}

export function useSetBugs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (enabled: boolean): Promise<BugsConfig> =>
      (await api.put("/admin/bugs", { enabled })).data,
    onSuccess: (data) => {
      qc.setQueryData(["admin", "bugs"], data);
      // Клиентские баги читают /flags — обновим и его.
      qc.invalidateQueries({ queryKey: ["flags"] });
    },
  });
}

/** Скачивает Markdown-описание багов через авторизованный запрос (blob → файл). */
export async function downloadBugsReport(): Promise<void> {
  const res = await api.get("/admin/bugs/report", { responseType: "blob" });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "shlapabank-bugs.md";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
