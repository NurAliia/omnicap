"use client";

/**
 * Цвет — вторичный сигнал доходности, основной — знак и стрелка. Это не
 * эстетика ради эстетики: доля дальтоников среди мужчин ~8%, а красно-зелёная
 * слепота — самый частый тип, и именно её мы используем для денег.
 */
export function PnlValue({ pct, absolute }: { pct: number | null; absolute?: number | null }) {
  if (pct === null) {
    return <span style={{ color: "var(--color-hint)" }}>—</span>;
  }

  const isPositive = pct >= 0;
  const color = isPositive ? "var(--color-positive)" : "var(--color-negative)";
  const arrow = isPositive ? "▲" : "▼";

  return (
    <span style={{ color, fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
      {arrow} {Math.abs(pct).toFixed(2)}%
      {absolute != null && (
        <span style={{ fontWeight: 400, opacity: 0.85 }}>
          {" "}
          ({isPositive ? "+" : "-"}
          {Math.abs(absolute).toLocaleString("ru-RU", { maximumFractionDigits: 2 })})
        </span>
      )}
    </span>
  );
}
