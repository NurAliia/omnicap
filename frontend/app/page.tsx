"use client";

import { AssetList, AssetListSkeleton } from "@/components/AssetList";
import { PortfolioSummary } from "@/components/PortfolioSummary";
import { ScreenshotUploader } from "@/components/ScreenshotUploader";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useAuth } from "./providers";

export default function PortfolioPage() {
  const auth = useAuth();
  const { assets, isLoading, refresh } = usePortfolio();

  if (auth.status === "loading") {
    return <CenteredMessage>Авторизация через Telegram...</CenteredMessage>;
  }
  if (auth.status === "error") {
    return <CenteredMessage isError>{auth.message}</CenteredMessage>;
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
      <h1 style={{ fontSize: "var(--text-xl)", fontWeight: 700, margin: 0 }}>Мой портфель</h1>

      <PortfolioSummary />

      <ScreenshotUploader onDone={refresh} />

      {isLoading ? <AssetListSkeleton /> : <AssetList assets={assets} />}
    </main>
  );
}

function CenteredMessage({ children, isError }: { children: React.ReactNode; isError?: boolean }) {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "var(--space-6)",
        color: isError ? "var(--color-negative)" : "var(--color-text-secondary)",
      }}
      role={isError ? "alert" : undefined}
    >
      {children}
    </div>
  );
}
