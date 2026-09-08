"use client";

/**
 * Минимальные типы Telegram WebApp SDK — берём только то, что реально используем.
 * Полная типизация: npm-пакет @twa-dev/types, но тащить лишнюю зависимость
 * ради десятка полей избыточно.
 */
export interface TelegramMainButton {
  text: string;
  isVisible: boolean;
  isActive: boolean;
  isProgressVisible: boolean;
  setText: (text: string) => void;
  onClick: (cb: () => void) => void;
  offClick: (cb: () => void) => void;
  show: () => void;
  hide: () => void;
  enable: () => void;
  disable: () => void;
  showProgress: (leaveActive?: boolean) => void;
  hideProgress: () => void;
}

export interface TelegramBackButton {
  isVisible: boolean;
  onClick: (cb: () => void) => void;
  offClick: (cb: () => void) => void;
  show: () => void;
  hide: () => void;
}

export interface TelegramWebApp {
  initData: string; // сырая строка, ИМЕННО её шлём на бэкенд для верификации
  initDataUnsafe: {
    user?: {
      id: number;
      username?: string;
      first_name?: string;
      last_name?: string;
      photo_url?: string;
    };
  };
  colorScheme: "light" | "dark";
  themeParams: Record<string, string>;
  MainButton: TelegramMainButton;
  BackButton: TelegramBackButton;
  ready: () => void;
  expand: () => void;
  close: () => void;
  onEvent: (event: string, cb: () => void) => void;
  offEvent: (event: string, cb: () => void) => void;
  showAlert: (message: string) => void;
  HapticFeedback?: {
    notificationOccurred: (type: "success" | "error" | "warning") => void;
    impactOccurred: (style: "light" | "medium" | "heavy") => void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp };
  }
}

export function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
}

/**
 * initDataUnsafe.user — недоверенные данные, годятся только для UI
 * ("Привет, Иван"), никогда не используются для авторизации или решений
 * бэкенда. Единственный источник истины для auth — verify_telegram_init_data
 * на бэкенде, которому передаётся raw initData.
 */
export function getUnsafeDisplayUser() {
  return getTelegramWebApp()?.initDataUnsafe.user ?? null;
}
