"use client";

import { useRef, useState } from "react";

import { BrokerAccountPicker } from "@/components/BrokerAccountPicker";
import { ReportUploader } from "@/components/ReportUploader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useBackButton } from "@/hooks/useBackButton";
import { useMainButton } from "@/hooks/useMainButton";
import { useAuth } from "@/app/providers";
import { api, ApiError } from "@/lib/api";
import type { BrokerAccountDto, ManualAssetInput } from "@/lib/api";
import { getTelegramWebApp } from "@/lib/telegram";

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 30_000;

const ASSET_TYPES: { value: ManualAssetInput["asset_type"]; label: string }[] = [
  { value: "stock", label: "Акция" },
  { value: "etf", label: "ETF" },
  { value: "bond", label: "Облигация" },
  { value: "crypto", label: "Крипта" },
  { value: "currency", label: "Валюта" },
  { value: "other", label: "Другое" },
];

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--color-bg-secondary)",
  color: "var(--color-text)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  padding: "10px 12px",
  fontSize: "var(--text-base)",
  boxSizing: "border-box",
};

type Phase =
  | { phase: "idle" }
  | { phase: "picking-broker" }
  | { phase: "choosing-method"; brokerAccount: BrokerAccountDto | null }
  | { phase: "manual-form"; brokerAccount: BrokerAccountDto | null }
  | { phase: "report-upload"; brokerAccount: BrokerAccountDto | null }
  | { phase: "uploading"; brokerAccount: BrokerAccountDto | null }
  | { phase: "processing"; jobId: string }
  | { phase: "done" }
  | { phase: "error"; message: string };

const MAIN_BUTTON_LABEL: Record<Phase["phase"], string> = {
  idle: "Добавить сделку",
  "picking-broker": "Добавить сделку",
  "choosing-method": "Добавить сделку",
  "report-upload": "Добавить сделку",
  "manual-form": "Добавить сделку",
  uploading: "Загрузка...",
  processing: "Распознаём скриншот...",
  done: "Добавить сделку",
  error: "Попробовать снова",
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Единый флоу добавления сделки: сначала выбор портфеля/брокера (иначе
 * группировка теряется, см. routers/screenshots.py::_save_trade_as_asset),
 * и только после этого — выбор способа ввода (скриншот через AI или вручную).
 */
export function AddAssetFlow({ onDone }: { onDone: () => void }) {
  const auth = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadBrokerAccountIdRef = useRef<string | undefined>(undefined);
  const [state, setState] = useState<Phase>({ phase: "idle" });

  const [ticker, setTicker] = useState("");
  const [assetType, setAssetType] = useState<ManualAssetInput["asset_type"]>("stock");
  const [currency, setCurrency] = useState("USD");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState(todayIso());
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isBusy = state.phase === "uploading" || state.phase === "processing";
  const isModalOpen =
    state.phase === "picking-broker" ||
    state.phase === "choosing-method" ||
    state.phase === "manual-form" ||
    state.phase === "report-upload";

  useMainButton({
    text: MAIN_BUTTON_LABEL[state.phase],
    onClick: () => setState({ phase: "picking-broker" }),
    disabled: isBusy,
    progress: isBusy,
    visible: auth.status === "ready" && !isModalOpen,
  });

  useBackButton(isModalOpen ? close : null);

  if (auth.status !== "ready") return null;
  const { token } = auth;

  function resetForm() {
    setTicker("");
    setAssetType("stock");
    setCurrency("USD");
    setQuantity("");
    setPrice("");
    setDate(todayIso());
    setFormError(null);
  }

  function close() {
    resetForm();
    setState({ phase: "idle" });
  }

  function handleBrokerPicked(brokerAccount: BrokerAccountDto | null) {
    setState({ phase: "choosing-method", brokerAccount });
  }

  function chooseScreenshot(brokerAccount: BrokerAccountDto | null) {
    // храним в ref, а не полагаемся на state: файловый диалог открывается
    // асинхронно, а .click() должен остаться в том же тике, что и клик
    // пользователя, иначе часть WebView не засчитает его как user gesture
    uploadBrokerAccountIdRef.current = brokerAccount?.id;
    setState({ phase: "idle" });
    inputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setState({ phase: "uploading", brokerAccount: null });
    try {
      const { job_id } = await api.uploadScreenshot(token, file, uploadBrokerAccountIdRef.current);
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

  async function handleManualSubmit(e: React.FormEvent, brokerAccount: BrokerAccountDto | null) {
    e.preventDefault();
    const qty = Number(quantity);
    const priceNum = Number(price);
    if (!ticker.trim() || !currency.trim() || !(qty > 0) || !(priceNum > 0)) {
      setFormError("Заполните тикер, количество и цену корректными значениями");
      return;
    }

    setIsSaving(true);
    setFormError(null);
    try {
      await api.addManualAsset(token, {
        ticker: ticker.trim().toUpperCase(),
        asset_type: assetType,
        currency: currency.trim().toUpperCase(),
        quantity: qty,
        price: priceNum,
        date: date || null,
        broker_account_id: brokerAccount?.id ?? null,
      });
      close();
      onDone();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Не удалось сохранить актив");
    } finally {
      setIsSaving(false);
    }
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

      {state.phase === "picking-broker" && (
        <BrokerAccountPicker onPick={handleBrokerPicked} onCancel={close} />
      )}

      {state.phase === "choosing-method" && (
        <Sheet onDismiss={close}>
          <span style={{ fontSize: "var(--text-base)", fontWeight: 600 }}>Как добавить?</span>
          <Button
            type="button"
            variant="primary"
            fullWidth
            onClick={() => setState({ phase: "report-upload", brokerAccount: state.brokerAccount })}
          >
            Загрузить отчет брокера
          </Button>
          <Button
            type="button"
            variant="secondary"
            fullWidth
            onClick={() => chooseScreenshot(state.brokerAccount)}
          >
            Загрузить скриншот
          </Button>
          <Button
            type="button"
            variant="secondary"
            fullWidth
            onClick={() => setState({ phase: "manual-form", brokerAccount: state.brokerAccount })}
          >
            Ввести вручную
          </Button>
          <Button type="button" variant="ghost" fullWidth onClick={close}>
            Отмена
          </Button>
        </Sheet>
      )}

      {state.phase === "report-upload" && state.brokerAccount && (
        <Sheet onDismiss={close}>
          <ReportUploader
            brokerAccountId={state.brokerAccount.id}
            onUploadComplete={() => {
              close();
              onDone();
            }}
          />
        </Sheet>
      )}

      {state.phase === "manual-form" && (
        <Sheet onDismiss={close}>
          <form
            onSubmit={(e) => handleManualSubmit(e, state.brokerAccount)}
            style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}
          >
            <span style={{ fontSize: "var(--text-base)", fontWeight: 600 }}>
              Новая сделка{state.brokerAccount ? ` — ${state.brokerAccount.broker_name}` : ""}
            </span>

            <input
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              placeholder="Тикер, напр. AAPL"
              style={inputStyle}
              autoFocus
            />

            <select
              value={assetType}
              onChange={(e) => setAssetType(e.target.value as ManualAssetInput["asset_type"])}
              style={inputStyle}
            >
              {ASSET_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>

            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <input
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="Количество"
                style={inputStyle}
              />
              <input
                type="text"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                placeholder="Валюта"
                maxLength={3}
                style={{ ...inputStyle, flex: "0 0 90px" }}
              />
            </div>

            <input
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="Цена покупки за единицу"
              style={inputStyle}
            />

            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />

            {formError && (
              <p role="alert" style={{ color: "var(--color-negative)", fontSize: "var(--text-sm)", margin: 0 }}>
                {formError}
              </p>
            )}

            <Button type="submit" variant="primary" fullWidth disabled={isSaving}>
              {isSaving ? "Сохранение..." : "Сохранить"}
            </Button>
            <Button type="button" variant="ghost" fullWidth onClick={close}>
              Отмена
            </Button>
          </form>
        </Sheet>
      )}

      {state.phase === "error" && (
        <p role="alert" style={{ color: "var(--color-negative)", fontSize: "var(--text-sm)", margin: 0 }}>
          {state.message}
        </p>
      )}
    </div>
  );
}

function Sheet({ children, onDismiss }: { children: React.ReactNode; onDismiss: () => void }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--color-overlay, rgba(0,0,0,0.5))",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={onDismiss}
    >
      <div style={{ width: "100%", maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <Card
          style={{
            borderBottomLeftRadius: 0,
            borderBottomRightRadius: 0,
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-3)",
          }}
        >
          {children}
        </Card>
      </div>
    </div>
  );
}
