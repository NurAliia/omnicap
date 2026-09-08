"use client";

import useSWR from "swr";

import { api } from "@/lib/api";
import { useAuth } from "@/app/providers";

export function usePortfolioSummary(baseCurrency: string | undefined) {
  const auth = useAuth();
  const token = auth.status === "ready" ? auth.token : null;

  const { data, error, isLoading } = useSWR(
    token ? ["portfolio-summary", token, baseCurrency] : null,
    ([, t, currency]) => api.getPortfolioSummary(t, currency),
    { revalidateOnFocus: true, refreshInterval: 60_000 }
  );

  return { summary: data, isLoading, error };
}
