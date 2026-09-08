"use client";

import { useRouter } from "next/navigation";

import { AssetTypeBadge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PnlValue } from "@/components/ui/PnlValue";
import { Skeleton } from "@/components/ui/Skeleton";
import type { AssetDto } from "@/lib/api";

export function AssetListSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      {[0, 1, 2].map((i) => (
        <Card key={i}>
          <Skeleton height={16} width="40%" />
          <div style={{ height: "var(--space-2)" }} />
          <Skeleton height={13} width="60%" />
        </Card>
      ))}
    </div>
  );
}

const UNASSIGNED_GROUP_LABEL = "Без портфеля";

function groupByBroker(assets: AssetDto[]): [string, AssetDto[]][] {
  const groups = new Map<string, AssetDto[]>();
  for (const a of assets) {
    const label = a.broker_name ?? UNASSIGNED_GROUP_LABEL;
    const group = groups.get(label);
    if (group) group.push(a);
    else groups.set(label, [a]);
  }
  // "Без портфеля" всегда в конце — это не портфель, а fallback
  return [...groups.entries()].sort(([a], [b]) => {
    if (a === UNASSIGNED_GROUP_LABEL) return 1;
    if (b === UNASSIGNED_GROUP_LABEL) return -1;
    return a.localeCompare(b);
  });
}

export function AssetList({ assets }: { assets: AssetDto[] }) {
  const router = useRouter();

  if (assets.length === 0) {
    return (
      <EmptyState
        icon="📈"
        title="Пока пусто"
        description="Загрузите скриншот сделки из приложения брокера — актив появится здесь автоматически"
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {groupByBroker(assets).map(([brokerLabel, groupAssets]) => (
        <section key={brokerLabel}>
          <h2
            style={{
              fontSize: "var(--text-sm)",
              fontWeight: 600,
              color: "var(--color-text-secondary)",
              margin: "0 0 var(--space-2)",
            }}
          >
            {brokerLabel}
          </h2>
          <ul style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            {groupAssets.map((a) => (
              <li key={a.id}>
                <Card
                  onClick={() => router.push(`/asset/${a.id}`)}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    cursor: "pointer",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                      <span style={{ fontSize: "var(--text-lg)", fontWeight: 600 }}>{a.ticker}</span>
                      <AssetTypeBadge type={a.asset_type} />
                    </div>
                    <div
                      style={{
                        fontSize: "var(--text-sm)",
                        color: "var(--color-text-secondary)",
                        marginTop: "var(--space-1)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {a.quantity} × {a.avg_purchase_price.toLocaleString("ru-RU")} {a.currency}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    {a.market_value !== null && (
                      <div style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                        {a.market_value.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} {a.currency}
                      </div>
                    )}
                    <div style={{ marginTop: "var(--space-1)", fontSize: "var(--text-sm)" }}>
                      <PnlValue pct={a.unrealized_pnl_pct} />
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
