import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { UserProfile } from "@/shared/api/types";

export function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: async (): Promise<UserProfile> => (await api.get("/profile")).data,
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<UserProfile> & {
      current_password?: string;
      new_password?: string;
    }): Promise<UserProfile> => (await api.put("/profile", payload)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}

export const AVATAR_COLORS = [
  "#F09427", // orange (brand)
  "#4DE89F", // green
  "#3DD7E5", // cyan
  "#5B6BFF", // indigo
  "#D4537E", // pink
  "#FF5A75", // red
  "#F7DE6E", // yellow
  "#888780", // gray
] as const;

export function getAvatarColor(profile: UserProfile | undefined | null): string {
  return profile?.avatar_color || "#F09427";
}
