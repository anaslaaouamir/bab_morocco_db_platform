import type { Metadata } from "next";
import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
import "./globals.css";
import ThemeRegistry from "@/components/ThemeRegistry";
import { SnackbarProvider } from "@/contexts/SnackbarContext";
import AppShell from "@/components/nav/AppShell";

export const metadata: Metadata = {
  title: "Bab Morocco — BD Intelligence Platform",
  description:
    "Plateforme interne de Business Development partenaires pour Bab Morocco OTA",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>
        {/*
         * Provider order (inner to outer):
         *   ThemeRegistry — Emotion SSR + MUI ThemeProvider
         *     SnackbarProvider — global toast layer (needs MUI theme for Alert/Snackbar)
         *       AppShell — navigation rail/bar shell
         *         {page content}
         */}
        <ThemeRegistry>
          <SnackbarProvider>
            <AppShell>{children}</AppShell>
          </SnackbarProvider>
        </ThemeRegistry>
      </body>
    </html>
  );
}
