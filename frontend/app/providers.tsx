"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { api, ApiError } from "@/lib/api";
import { createSupabaseClient } from "@/lib/supabase";
import { getTelegramWebApp } from "@/lib/telegram";
import { useTelegramTheme } from "@/lib/theme";

type AuthState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; token: string; userId: string; supabase: SupabaseClient };

const AuthContext = createContext<AuthState>({ status: "loading" });

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  useTelegramTheme();
  const [state, setState] = useState<AuthState>({ status: "loading" });

  const login = useCallback(async () => {
    const tg = getTelegramWebApp();

    if (!tg) {
      // Открыли не в Telegram (обычный браузер) — для dev-режима можно
      // подставлять mock initData через .env, в проде это просто ошибка.
      setState({ status: "error", message: "Приложение должно быть открыто внутри Telegram" });
      return;
    }

    tg.ready();
    tg.expand();

    if (!tg.initData) {
      setState({ status: "error", message: "Telegram не передал initData" });
      return;
    }

    try {
      const { access_token, user_id } = await api.loginWithTelegram(tg.initData);
      setState({
        status: "ready",
        token: access_token,
        userId: user_id,
        supabase: createSupabaseClient(access_token),
      });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Не удалось авторизоваться";
      setState({ status: "error", message });
    }
  }, []);

  useEffect(() => {
    login();
  }, [login]);

  // Токен живёт 1 час (backend: access_token_ttl_seconds). initData остаётся
  // валидным всё время, пока открыт Mini App, поэтому просто перелогиниваемся
  // заранее, не дожидаясь 401 от бэкенда.
  useEffect(() => {
    if (state.status !== "ready") return;
    const REFRESH_AFTER_MS = 55 * 60 * 1000; // 5 минут запаса до истечения часового токена
    const timer = setTimeout(login, REFRESH_AFTER_MS);
    return () => clearTimeout(timer);
  }, [state.status, login]);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
