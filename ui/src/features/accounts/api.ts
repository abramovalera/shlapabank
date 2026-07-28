import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { Account } from "@/shared/api/types";

export function useRenameAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: number; name: string }) =>
      (await api.patch<Account>(`/accounts/${args.id}`, { name: args.name })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
    },
  });
}
