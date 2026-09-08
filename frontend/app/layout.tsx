import Script from "next/script";

import { SkeletonStyles } from "@/components/ui/Skeleton";
import { AuthProvider } from "./providers";
import "./globals.css";

export const metadata = {
  title: "Omnicap",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        {/* beforeInteractive: initData и themeParams должны быть доступны до
            гидратации, иначе AuthProvider/ThemeProvider стартуют раньше,
            чем появится window.Telegram */}
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
        <SkeletonStyles />
      </head>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
