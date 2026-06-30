import type { Metadata } from "next";
import "./globals.css";
import ThemeRegistry from "@/components/ThemeRegistry";
import { SnackbarProvider } from "@/contexts/SnackbarContext";
import { AuthProvider } from "@/contexts/AuthContext";
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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@300;400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {/*
         * Provider order (inner to outer):
         *   ThemeRegistry — Emotion SSR + MUI ThemeProvider
         *     AuthProvider — authenticated user/token state
         *       SnackbarProvider — global toast layer (needs MUI theme for Alert/Snackbar)
         *         AppShell — navigation rail/bar shell
         *           {page content}
         */}
        <ThemeRegistry>
          <AuthProvider>
            <SnackbarProvider>
              <AppShell>{children}</AppShell>
            </SnackbarProvider>
          </AuthProvider>
        </ThemeRegistry>
      </body>
    </html>
  );
}
