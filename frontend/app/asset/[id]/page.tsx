"use client";

import { useParams, useRouter } from "next/navigation";

import { AssetTypeBadge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { PnlValue } from "@/components/ui/PnlValue";
import { useBackButton } from "@/hooks/useBackButton";
import { usePortfolio } from "@/hooks/usePortfolio";

export default function AssetDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { assets, isLoading } = usePortfolio();

  // Нативная стрелка "назад" в шапке Telegram вместо своей — экран открыт
  // не с корня, значит кнопка назад уместна именно здесь.
  useBackButton(() => router.back());

  if (isLoading) return null;

  const asset = assets.find((a) => a.id === id);
  if (!asset) {
    return (
      <main style={{ padding: "var(--space-4)", textAlign: "center", color: "var(--color-text-secondary)" }}>
        Актив не найден
      </main>
    );
  }

  return (
    <main
      style={{
        maxWidth: 480,
        margin: "0 auto",
        padding: "var(--space-4)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-4)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        <h1 style={{ fontSize: "var(--text-xl)", fontWeight: 700, margin: 0 }}>{asset.ticker}</h1>
        <AssetTypeBadge type={asset.asset_type} />
      </div>

      <Card>
        <Row label="Количество" value={asset.quantity.toLocaleString("ru-RU")} />
        <Row
          label="Средняя цена покупки"
          value={`${asset.avg_purchase_price.toLocaleString("ru-RU")} ${asset.currency}`}
        />
        <Row
          label="Текущая цена"
          value={asset.current_price != null ? `${asset.current_price.toLocaleString("ru-RU")} ${asset.currency}` : "—"}
        />
        <Row
          label="Рыночная стоимость"
          value={asset.market_value != null ? `${asset.market_value.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ${asset.currency}` : "—"}
        />
      </Card>

      <Card>
        <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)" }}>
          Нереализованная доходность
        </div>
        <div style={{ marginTop: "var(--space-2)", fontSize: "var(--text-lg)" }}>
          <PnlValue pct={asset.unrealized_pnl_pct} absolute={asset.unrealized_pnl} />
        </div>
      </Card>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "var(--space-2) 0",
        borderBottom: "1px solid var(--color-border)",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <span style={{ color: "var(--color-text-secondary)" }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}
