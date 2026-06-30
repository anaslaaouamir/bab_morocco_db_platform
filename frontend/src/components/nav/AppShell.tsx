"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import ButtonBase from "@mui/material/ButtonBase";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import Tooltip from "@mui/material/Tooltip";
import BottomNavigation from "@mui/material/BottomNavigation";
import BottomNavigationAction from "@mui/material/BottomNavigationAction";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import { alpha } from "@mui/material/styles";
import navItems, { isActive } from "./navItems";
import { healthApi, scanApi } from "@/lib/api";
import { loadSettings, loadScheduledJobs, saveScheduledJobs } from "@/lib/settingsStore";
import { useAuth } from "@/contexts/AuthContext";

// MD3 Navigation Rail dimensions
const RAIL_WIDTH = 80;
// MD3 Navigation Bar height (including safe-area inset on mobile)
const NAV_BAR_HEIGHT = 80;

// ---------------------------------------------------------------------------
// Desktop — Navigation Rail (Expanded ≥ 840px / md breakpoint in MUI)
// ---------------------------------------------------------------------------
function NavigationRail({
  pathname,
  items,
  userLabel,
  onLogout,
}: {
  pathname: string;
  items: typeof navItems;
  userLabel?: string;
  onLogout: () => void;
}) {
  return (
    <Paper
      component="nav"
      aria-label="Navigation principale"
      square
      elevation={0}
      sx={{
        display: { xs: "none", md: "flex" },
        flexDirection: "column",
        alignItems: "center",
        width: RAIL_WIDTH,
        minHeight: "100vh",
        position: "sticky",
        top: 0,
        alignSelf: "flex-start",
        pt: 2,
        pb: 2,
        gap: 0.5,
        borderRight: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
        zIndex: "appBar",
        overflow: "hidden",
      }}
    >
      {/* Brand logo — top of rail */}
      <Box
        sx={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          overflow: "hidden",
          mb: 2,
          flexShrink: 0,
        }}
      >
        <Image
          src="/favicon.png"
          alt="Bab Morocco"
          width={44}
          height={44}
          style={{ objectFit: "cover", width: "100%", height: "100%" }}
          priority
        />
      </Box>

      {/* Navigation items */}
      {items.map((item) => {
        const active = isActive(item.href, pathname);
        const Icon = active ? item.ActiveIcon : item.InactiveIcon;

        return (
          <Tooltip key={item.href} title={item.label} placement="right" arrow>
            {/*
             * ButtonBase polymorphism: cast to ElementType so TS accepts the
             * next/link component while preserving all ButtonBase behaviours
             * (ripple, keyboard focus, aria role="button").
             */}
            <ButtonBase
              component={Link as React.ElementType}
              href={item.href}
              aria-current={active ? "page" : undefined}
              sx={{
                flexDirection: "column",
                alignItems: "center",
                gap: 0.5,
                width: "100%",
                py: 0.75,
                color: active ? "primary.main" : "text.secondary",
                transition: "color 150ms ease",
                "&:hover": {
                  bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
                },
                "&:focus-visible": {
                  outline: (theme) =>
                    `2px solid ${theme.palette.primary.main}`,
                  outlineOffset: -2,
                },
              }}
            >
              {/* MD3 active-indicator pill: 56 × 32 px, borderRadius 16 */}
              <Box
                sx={{
                  width: 56,
                  height: 32,
                  borderRadius: 2,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  bgcolor: active
                    ? (theme) => alpha(theme.palette.primary.main, 0.12)
                    : "transparent",
                  transition: "background-color 200ms ease",
                }}
              >
                <Icon fontSize="small" />
              </Box>

              {/* MD3 labelSmall */}
              <Typography
                component="span"
                sx={{
                  fontSize: "0.6875rem",
                  fontWeight: active ? 700 : 500,
                  lineHeight: 1.2,
                  letterSpacing: "0.031em",
                  textAlign: "center",
                  maxWidth: 72,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  color: "inherit",
                  fontFamily: "inherit",
                }}
              >
                {item.label}
              </Typography>
            </ButtonBase>
          </Tooltip>
        );
      })}

      {/* Logout — pinned to the bottom of the rail */}
      <Tooltip title={userLabel ? `Déconnexion (${userLabel})` : "Déconnexion"} placement="right" arrow>
        <IconButton
          onClick={onLogout}
          aria-label="Déconnexion"
          sx={{ mt: "auto", color: "text.secondary" }}
        >
          <LogoutRoundedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Paper>
  );
}

// ---------------------------------------------------------------------------
// Mobile — Navigation Bar (Compact < 600px / xs breakpoint)
// ---------------------------------------------------------------------------
function NavigationBar({ pathname, items }: { pathname: string; items: typeof navItems }) {
  const activeHref =
    items.find((item) => isActive(item.href, pathname))?.href ?? "/";

  return (
    <Paper
      component="nav"
      aria-label="Navigation principale"
      elevation={3}
      sx={{
        display: { xs: "block", md: "none" },
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: "appBar",
        // Extend into device safe-area (notch / home bar)
        pb: "env(safe-area-inset-bottom)",
      }}
    >
      <BottomNavigation
        value={activeHref}
        showLabels
        sx={{ height: NAV_BAR_HEIGHT, bgcolor: "background.paper" }}
      >
        {items.map((item) => {
          const active = isActive(item.href, pathname);
          const Icon = active ? item.ActiveIcon : item.InactiveIcon;

          return (
            <BottomNavigationAction
              key={item.href}
              component={Link as React.ElementType}
              href={item.href}
              label={item.label}
              value={item.href}
              aria-current={active ? "page" : undefined}
              icon={<Icon fontSize="small" />}
              sx={{
                minWidth: 0,
                px: 0.5,
                color: "text.secondary",
                // MD3 active-indicator pill on selected item
                "&.Mui-selected": {
                  color: "primary.main",
                  "& .MuiBottomNavigationAction-label": {
                    fontWeight: 700,
                    fontSize: "0.6875rem",
                  },
                },
                "& .MuiBottomNavigationAction-label": {
                  fontSize: "0.6875rem",
                  letterSpacing: "0.031em",
                },
              }}
            />
          );
        })}
      </BottomNavigation>
    </Paper>
  );
}

// ---------------------------------------------------------------------------
// AppShell — root shell rendered inside ThemeRegistry, wraps page content
// ---------------------------------------------------------------------------
export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { user, isAdmin, logout } = useAuth();
  const [backendDown, setBackendDown] = useState(false);

  const visibleNavItems = navItems.filter((item) => !item.requiresAdmin || isAdmin);

  useEffect(() => {
    healthApi.check().catch(() => setBackendDown(true));
  }, []);

  // ── Scheduled scan executor ────────────────────────────────────
  useEffect(() => {
    if (!isAdmin) return;

    const POLL_INTERVAL_MS = 60_000; // check every minute

    async function runDueJobs() {
      const settings = loadSettings();
      if (!settings.scheduledScan.enabled) return;

      const now = new Date();
      const currentHour = now.getHours();
      const { windowStartHour, windowEndHour } = settings.scheduledScan;

      // Determine if we are within the configured window
      const inWindow = windowEndHour > windowStartHour
        ? currentHour >= windowStartHour && currentHour < windowEndHour
        : currentHour >= windowStartHour || currentHour < windowEndHour; // overnight window

      if (!inWindow) return;

      const jobs = loadScheduledJobs();
      const due  = jobs.filter((j) => !j.fired && new Date(j.scheduledAt) <= now);
      if (due.length === 0) return;

      for (const job of due) {
        try {
          // Fire and forget — just start the job; the scan dialog handles polling
          await scanApi.start({
            ville:          job.ville,
            pays:           job.pays,
            typePartenaire: job.typePartenaire as import("@/types/prospect").PartnerType,
            limite:         job.limite,
          });
        } catch {
          // Silent fail — will retry on next tick if not marked fired
        }
        // Mark as fired regardless so we don't re-fire on error spam
        job.fired = true;
      }

      saveScheduledJobs(jobs);
    }

    runDueJobs();
    const timer = setInterval(runDueJobs, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isAdmin]);

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <NavigationRail
        pathname={pathname}
        items={visibleNavItems}
        userLabel={user?.email}
        onLogout={logout}
      />

      <Box
        component="main"
        sx={{
          flex: 1,
          minWidth: 0,
          pb: { xs: `${NAV_BAR_HEIGHT}px`, md: 0 },
          bgcolor: "background.default",
          position: "relative",
        }}
      >
        {/* Logout — floating button, mobile only (rail has its own on desktop) */}
        <Tooltip title={user?.email ? `Déconnexion (${user.email})` : "Déconnexion"}>
          <IconButton
            onClick={logout}
            aria-label="Déconnexion"
            sx={{
              display: { xs: "flex", md: "none" },
              position: "fixed",
              top: 12,
              right: 12,
              zIndex: (t) => t.zIndex.appBar + 1,
              bgcolor: "background.paper",
              boxShadow: 2,
              "&:hover": { bgcolor: "background.paper" },
            }}
          >
            <LogoutRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        {backendDown && (
          <Alert
            severity="error"
            variant="filled"
            sx={{ borderRadius: 0, fontSize: "0.8125rem" }}
          >
            Backend inaccessible — vérifiez que le serveur est démarré.
          </Alert>
        )}
        {children}
      </Box>

      <NavigationBar pathname={pathname} items={visibleNavItems} />
    </Box>
  );
}
