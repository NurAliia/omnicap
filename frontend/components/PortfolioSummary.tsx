"use client";

import { useState } from "react";

import { Card } from "@/components/ui/Card";
import { PnlValue } from "@/components/ui/PnlValue";
import { Skeleton } from "@/components/ui/Skeleton";
import { usePortfolioSummary } from "@/hooks/usePortfolioSummary";

const CURRENCY_OPTIONS = ["USD", "EUR", "RUB", "GBP"];

export function PortfolioSummary() {
  // undefined -> бэкенд берёт users.base_currency (сохранённое предпочтение).
  // Выбор здесь — только на сессию; персист предпочтения через PATCH
  // /users/me можно добавить отдельно, если понадобится.
  const [currency, setCurrency] = useState<string | undefined>(undefined);
  const { summary, isLoading } = usePortfolioSummary(currency);

  if (isLoading || !summary) {
    return (
      <Card>
        <Skeleton height={14} width={100} />
        <div style={{ height: "var(--space-2)" }} />
        <Skeleton height={36} width={180} />
      </Card>
    );
  }

  if (summary.total_market_value === 0 && summary.skipped_tickers.length === 0) {
    return null;
  }

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)" }}>
          Стоимость портфеля
        </span>
        <select
          value={currency ?? summary.base_currency}
          onChange={(e) => setCurrency(e.target.value)}
          style={{
            background: "var(--color-bg-secondary)",
            color: "var(--color-text)",
            border: "none",
            borderRadius: "var(--radius-sm)",
            fontSize: "var(--text-xs)",
            fontWeight: 600,
            padding: "4px 8px",
          }}
        >
          {CURRENCY_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div
        style={{
          fontSize: "var(--text-2xl)",
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          marginTop: "var(--space-1)",
        }}
      >
        {summary.total_market_value.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}{" "}
        {summary.base_currency}
      </div>

      <div style={{ marginTop: "var(--space-2)" }}>
        <PnlValue pct={summary.total_unrealized_pnl_pct} absolute={summary.total_unrealized_pnl} />
      </div>

      {summary.rates_stale && (
        <div style={{ fontSize: "var(--text-xs)", color: "var(--color-warning)", marginTop: "var(--space-2)" }}>
          Курсы валют могли устареть
        </div>
      )}
      {summary.skipped_tickers.length > 0 && (
        <div style={{ fontSize: "var(--text-xs)", color: "var(--color-hint)", marginTop: "var(--space-1)" }}>
          Не удалось сконвертировать: {summary.skipped_tickers.join(", ")}
        </div>
      )}
    </Card>
  );
}
