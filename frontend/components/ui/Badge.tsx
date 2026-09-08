"use client";

const ASSET_TYPE_LABEL: Record<string, string> = {
  stock: "Акция",
  etf: "ETF",
  bond: "Облигация",
  crypto: "Крипто",
  currency: "Валюта",
  other: "Другое",
};

export function AssetTypeBadge({ type }: { type: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: "var(--text-xs)",
        fontWeight: 600,
        color: "var(--color-text-secondary)",
        background: "var(--color-bg-secondary)",
        borderRadius: "var(--radius-pill)",
        padding: "2px 8px",
      }}
    >
      {ASSET_TYPE_LABEL[type] ?? type}
    </span>
  );
}
