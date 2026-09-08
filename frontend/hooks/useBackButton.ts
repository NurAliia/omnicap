"use client";

import { useEffect, useRef } from "react";

import { getTelegramWebApp } from "@/lib/telegram";

/**
 * Показывает нативную стрелку "назад" в шапке клиента Telegram, пока
 * компонент смонтирован. Передайте null, если на этом экране кнопки
 * "назад" быть не должно (например, корневой экран портфеля).
 */
export function useBackButton(onBack: (() => void) | null) {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    const backButton = getTelegramWebApp()?.BackButton;
    if (!backButton || !onBack) return;

    const handler = () => onBackRef.current?.();
    backButton.onClick(handler);
    backButton.show();

    return () => {
      backButton.offClick(handler);
      backButton.hide();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!onBack]);
}
