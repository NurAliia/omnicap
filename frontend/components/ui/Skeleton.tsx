"use client";

export function Skeleton({ height = 16, width = "100%" }: { height?: number; width?: number | string }) {
  return (
    <span
      style={{
        display: "inline-block",
        height,
        width,
        borderRadius: "var(--radius-sm)",
        background:
          "linear-gradient(90deg, var(--color-bg-secondary) 25%, var(--color-border) 37%, var(--color-bg-secondary) 63%)",
        backgroundSize: "400% 100%",
        animation: "skeleton-shimmer 1.4s ease infinite",
      }}
    />
  );
}

export function SkeletonStyles() {
  return (
    <style>{`
      @keyframes skeleton-shimmer {
        0% { background-position: 100% 50%; }
        100% { background-position: 0 50%; }
      }
    `}</style>
  );
}
