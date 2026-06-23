"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import ButtonBase from "@mui/material/ButtonBase";
import Typography from "@mui/material/Typography";
import Tooltip from "@mui/material/Tooltip";
import BottomNavigation from "@mui/material/BottomNavigation";
import BottomNavigationAction from "@mui/material/BottomNavigationAction";
import { alpha } from "@mui/material/styles";
import navItems, { isActive } from "./navItems";

// MD3 Navigation Rail dimensions
const RAIL_WIDTH = 80;
// MD3 Navigation Bar height (including safe-area inset on mobile)
const NAV_BAR_HEIGHT = 80;

// ---------------------------------------------------------------------------
// Desktop — Navigation Rail (Expanded ≥ 840px / md breakpoint in MUI)
// ---------------------------------------------------------------------------
function NavigationRail({ pathname }: { pathname: string }) {
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
      {/* Brand monogram — top of rail */}
      <Box
        sx={{
          width: 40,
          height: 40,
          borderRadius: "50%",
          bgcolor: "primary.main",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          mb: 2,
          flexShrink: 0,
        }}
      >
        <Typography
          component="span"
          sx={{
            color: "primary.contrastText",
            fontWeight: 700,
            fontSize: "0.75rem",
            fontFamily: "inherit",
            letterSpacing: "0.05em",
          }}
        >
          BM
        </Typography>
      </Box>

      {/* Navigation items */}
      {navItems.map((item) => {
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
    </Paper>
  );
}

// ---------------------------------------------------------------------------
// Mobile — Navigation Bar (Compact < 600px / xs breakpoint)
// ---------------------------------------------------------------------------
function NavigationBar({ pathname }: { pathname: string }) {
  const activeHref =
    navItems.find((item) => isActive(item.href, pathname))?.href ?? "/";

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
        {navItems.map((item) => {
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

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <NavigationRail pathname={pathname} />

      <Box
        component="main"
        sx={{
          flex: 1,
          minWidth: 0, // prevent flex child from overflowing
          // Reserve space for the fixed bottom bar on mobile
          pb: { xs: `${NAV_BAR_HEIGHT}px`, md: 0 },
          bgcolor: "background.default",
        }}
      >
        {children}
      </Box>

      <NavigationBar pathname={pathname} />
    </Box>
  );
}
