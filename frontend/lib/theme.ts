"use client";

import { useEffect } from "react";

import { getTelegramWebApp } from "./telegram";

/**
 * Telegram присылает themeParams клиента пользователя (его выбранную тему
 * оформления, включая кастомные темы из Settings -> Chat Settings -> Theme).
 * Мапим их на наши design tokens, чтобы приложение выглядело органичной
 * частью Telegram, а не отдельным веб-сайтом внутри него.
 *
 * Если параметр отсутствует (например, старая версия клиента) — CSS-fallback
 * из globals.css остаётся в силе, потому что мы не трогаем переменную,
 * которую Telegram не прислал.
 */
const THEME_PARAM_TO_CSS_VAR: Record<string, string> = {
  bg_color: "--color-bg",
  secondary_bg_color: "--color-bg-secondary",
  section_bg_color: "--color-surface",
  text_color: "--color-text",
  subtitle_text_color: "--color-text-secondary",
  hint_color: "--color-hint",
  section_separator_color: "--color-border",
  button_color: "--color-accent",
  button_text_color: "--color-accent-text",
};

function applyThemeParams() {
  const tg = getTelegramWebApp();
  if (!tg) return;

  const root = document.documentElement;
  root.setAttribute("data-tg-theme", tg.colorScheme);

  for (const [tgKey, cssVar] of Object.entries(THEME_PARAM_TO_CSS_VAR)) {
    const value = tg.themeParams[tgKey];
    if (value) root.style.setProperty(cssVar, value);
  }
}

export function useTelegramTheme() {
  useEffect(() => {
    const tg = getTelegramWebApp();
    if (!tg) return;

    applyThemeParams();
    tg.onEvent("themeChanged", applyThemeParams);
    return () => tg.offEvent("themeChanged", applyThemeParams);
  }, []);
}
