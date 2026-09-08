"use client";

export function EmptyState({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "var(--space-8) var(--space-4)",
        color: "var(--color-text-secondary)",
      }}
    >
      <div style={{ fontSize: 40, marginBottom: "var(--space-3)" }}>{icon}</div>
      <div style={{ fontSize: "var(--text-lg)", fontWeight: 600, color: "var(--color-text)" }}>
        {title}
      </div>
      <div style={{ fontSize: "var(--text-sm)", marginTop: "var(--space-1)" }}>{description}</div>
    </div>
  );
}
