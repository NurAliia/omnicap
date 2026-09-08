"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useBackButton } from "@/hooks/useBackButton";
import { useBrokerAccounts } from "@/hooks/useBrokerAccounts";
import type { BrokerAccountDto } from "@/lib/api";

interface BrokerAccountPickerProps {
  onPick: (brokerAccount: BrokerAccountDto | null) => void;
  onCancel: () => void;
}

/**
 * Модалка выбора портфеля/брокера (IB, Bybit, ...) перед загрузкой
 * скриншота — иначе сделка попадает в assets с broker_account_id = null
 * и группировка теряется (см. routers/screenshots.py::_save_trade_as_asset).
 */
export function BrokerAccountPicker({ onPick, onCancel }: BrokerAccountPickerProps) {
  const { brokerAccounts, isLoading, createBrokerAccount } = useBrokerAccounts();
  const [newName, setNewName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  useBackButton(onCancel);

  async function handleCreate() {
    const name = newName.trim();
    if (!name || isCreating) return;
    setIsCreating(true);
    try {
      const created = await createBrokerAccount(name);
      onPick(created);
    } finally {
      setIsCreating(false);
    }
  }

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
      onClick={onCancel}
    >
      <div
        style={{ width: "100%", maxWidth: 480 }}
        onClick={(e) => e.stopPropagation()}
      >
        <Card
          style={{
            borderBottomLeftRadius: 0,
            borderBottomRightRadius: 0,
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-3)",
          }}
        >
          <span style={{ fontSize: "var(--text-base)", fontWeight: 600 }}>
            Какой это портфель?
          </span>

          {!isLoading && brokerAccounts.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {brokerAccounts.map((ba) => (
                <Button
                  key={ba.id}
                  type="button"
                  variant="secondary"
                  fullWidth
                  onClick={() => onPick(ba)}
                >
                  {ba.broker_name}
                </Button>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Новый портфель, напр. IB, Bybit"
              style={{
                flex: 1,
                background: "var(--color-bg-secondary)",
                color: "var(--color-text)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                padding: "10px 12px",
                fontSize: "var(--text-base)",
              }}
            />
            <Button
              type="button"
              variant="primary"
              disabled={!newName.trim() || isCreating}
              onClick={handleCreate}
            >
              Добавить
            </Button>
          </div>

          <Button type="button" variant="ghost" fullWidth onClick={() => onPick(null)}>
            Без портфеля
          </Button>
          <Button type="button" variant="ghost" fullWidth onClick={onCancel}>
            Отмена
          </Button>
        </Card>
      </div>
    </div>
  );
}
