"use client";

import useSWR from "swr";

import { api } from "@/lib/api";
import { useAuth } from "@/app/providers";

export function useBrokerAccounts() {
  const auth = useAuth();
  const token = auth.status === "ready" ? auth.token : null;

  const { data, error, isLoading, mutate } = useSWR(
    token ? ["broker-accounts", token] : null,
    ([, t]) => api.listBrokerAccounts(t)
  );

  async function createBrokerAccount(brokerName: string) {
    if (!token) throw new Error("Not authenticated");
    const created = await api.createBrokerAccount(token, brokerName);
    await mutate();
    return created;
  }

  return {
    brokerAccounts: data ?? [],
    isLoading,
    error,
    createBrokerAccount,
  };
}
