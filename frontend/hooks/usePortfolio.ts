"use client";

import useSWR from "swr";

import { api } from "@/lib/api";
import { useAuth } from "@/app/providers";

export function usePortfolio() {
  const auth = useAuth();
  const token = auth.status === "ready" ? auth.token : null;

  const { data, error, isLoading, mutate } = useSWR(
    token ? ["assets", token] : null,
    ([, t]) => api.listAssets(t),
    {
      revalidateOnFocus: true, // пользователь мог вернуться из скриншот-флоу
      refreshInterval: 60_000, // котировки в price_cache обновляются периодически
    }
  );

  return {
    assets: data ?? [],
    isLoading,
    error,
    refresh: mutate,
  };
}
