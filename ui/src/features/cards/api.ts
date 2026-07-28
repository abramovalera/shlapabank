import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { Card, CardDesign, CardType, CardPaymentSystem } from "@/shared/api/types";

export function useCards() {
  return useQuery({
    queryKey: ["cards"],
    queryFn: async (): Promise<Card[]> => (await api.get("/cards")).data,
  });
}

export function useIssueCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      account_id: number;
      card_type?: CardType;
      payment_system?: CardPaymentSystem;
      design?: CardDesign;
      accept_terms?: boolean;
    }) => (await api.post<Card>("/cards", { accept_terms: true, ...payload })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cards"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
    },
  });
}
