"use client";

import { useEffect, useRef } from "react";

import { getTelegramWebApp } from "@/lib/telegram";

interface MainButtonOptions {
  text: string;
  onClick: () => void;
  visible?: boolean;
  disabled?: boolean;
  progress?: boolean;
}

/**
 * Декларативная обёртка над императивным TelegramWebApp.MainButton — это
 * singleton нативного UI, а не DOM-элемент, поэтому:
 * - onClick регистрируем один раз через ref, чтобы не плодить обработчики
 *   на каждый ре-рендер (offClick без ссылки на актуальный handler невозможен);
 * - на unmount обязательно hide(), иначе кнопка "утечёт" на следующий экран,
 *   у которого своей MainButton-логики может не быть.
 */
export function useMainButton({
  text,
  onClick,
  visible = true,
  disabled = false,
  progress = false,
}: MainButtonOptions) {
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;

  useEffect(() => {
    const mainButton = getTelegramWebApp()?.MainButton;
    if (!mainButton) return;

    const handler = () => onClickRef.current();
    mainButton.onClick(handler);

    return () => {
      mainButton.offClick(handler);
      mainButton.hide();
    };
  }, []);

  useEffect(() => {
    const mainButton = getTelegramWebApp()?.MainButton;
    if (!mainButton) return;

    mainButton.setText(text);
    disabled ? mainButton.disable() : mainButton.enable();
    progress ? mainButton.showProgress(true) : mainButton.hideProgress();
    visible ? mainButton.show() : mainButton.hide();
  }, [text, visible, disabled, progress]);
}
