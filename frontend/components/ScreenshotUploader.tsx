"use client";

import { useRef, useState } from "react";

import { useMainButton } from "@/hooks/useMainButton";
import { api } from "@/lib/api";
import { useAuth } from "@/app/providers";
import { getTelegramWebApp } from "@/lib/telegram";

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 30_000;

type UploadState =
  | { phase: "idle" }
  | { phase: "uploading" }
  | { phase: "processing"; jobId: string }
  | { phase: "done" }
  | { phase: "error"; message: string };

const PHASE_LABEL: Record<UploadState["phase"], string> = {
  idle: "Добавить сделку по скриншоту",
  uploading: "Загрузка...",
  processing: "Распознаём скриншот...",
  done: "Добавить сделку по скриншоту",
  error: "Попробовать снова",
};

export function ScreenshotUploader({ onDone }: { onDone: () => void }) {
  const auth = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>({ phase: "idle" });
  const isBusy = state.phase === "uploading" || state.phase === "processing";

  // MainButton — нативная кнопка Telegram, закреплена внизу экрана вне
  // скролла и красится в button_color пользователя автоматически.
  // NB: программный input.click() из колбэка MainButton у части WebView-
  // реализаций может не засчитаться как "user gesture" для файлового
  // диалога — стоит явно проверить на реальных клиентах (iOS/Android/
  // Desktop) перед релизом; если диалог не открывается, потребуется
  // вернуть видимый DOM-элемент как точку тапа.
  useMainButton({
    text: PHASE_LABEL[state.phase],
    onClick: () => inputRef.current?.click(),
    disabled: isBusy,
    progress: isBusy,
    visible: auth.status === "ready",
  });

  if (auth.status !== "ready") return null;
  const { token } = auth;

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setState({ phase: "uploading" });
    try {
      const { job_id } = await api.uploadScreenshot(token, file);
      setState({ phase: "processing", jobId: job_id });
      await pollJob(job_id);
    } catch (err) {
      setState({
        phase: "error",
        message: err instanceof Error ? err.message : "Не удалось загрузить скриншот",
      });
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function pollJob(jobId: string) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
      const job = await api.getScreenshotJob(token, jobId);

      if (job.status === "done") {
        getTelegramWebApp()?.HapticFeedback?.notificationOccurred("success");
        setState({ phase: "done" });
        onDone();
        return;
      }
      if (job.status === "failed") {
        getTelegramWebApp()?.HapticFeedback?.notificationOccurred("error");
        setState({ phase: "error", message: job.error_message ?? "Не удалось распознать скриншот" });
        return;
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    setState({ phase: "error", message: "Обработка заняла слишком много времени, попробуйте позже" });
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleFileChange}
        style={{ display: "none" }}
      />
      {state.phase === "error" && (
        <p
          role="alert"
          style={{ color: "var(--color-negative)", fontSize: "var(--text-sm)", margin: 0 }}
        >
          {state.message}
        </p>
      )}
    </div>
  );
}
