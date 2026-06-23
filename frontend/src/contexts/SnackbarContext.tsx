"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useState,
} from "react";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import type { AlertColor } from "@mui/material/Alert";
import Slide from "@mui/material/Slide";
import type { TransitionProps } from "@mui/material/transitions";

// ─── Public API ────────────────────────────────────────────────────────────

export interface SnackbarOptions {
  message: string;
  severity?: AlertColor;       // default "info"
  duration?: number;           // ms — default 4 000
  action?: React.ReactNode;    // e.g. an "Annuler" Button
}

interface SnackbarContextValue {
  /** Call with a string for a quick info toast, or an options object for full control. */
  showSnackbar: (options: SnackbarOptions | string) => void;
}

// ─── Context ───────────────────────────────────────────────────────────────

const SnackbarContext = createContext<SnackbarContextValue | null>(null);

// ─── Slide transition (up from bottom) ────────────────────────────────────

function SlideUp(props: TransitionProps & { children: React.ReactElement }) {
  return <Slide {...props} direction="up" />;
}

// ─── Provider ──────────────────────────────────────────────────────────────

export function SnackbarProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<SnackbarOptions>({
    message: "",
    severity: "info",
    duration: 4000,
  });

  const showSnackbar = useCallback((options: SnackbarOptions | string) => {
    const normalized: SnackbarOptions =
      typeof options === "string"
        ? { message: options, severity: "info", duration: 4000 }
        : { severity: "info", duration: 4000, ...options };

    // Close the previous one first, then open the new one in the next tick
    // so the Snackbar remounts with fresh content.
    setOpen(false);
    setTimeout(() => {
      setCurrent(normalized);
      setOpen(true);
    }, 100);
  }, []);

  function handleClose(_: unknown, reason?: string) {
    if (reason === "clickaway") return;
    setOpen(false);
  }

  return (
    <SnackbarContext.Provider value={{ showSnackbar }}>
      {children}

      <Snackbar
        open={open}
        autoHideDuration={current.duration}
        onClose={handleClose}
        TransitionComponent={SlideUp}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        // On mobile, float above the Navigation Bar (80 px) + 8 px gap.
        sx={{
          bottom: {
            xs: "calc(80px + env(safe-area-inset-bottom, 0px) + 8px) !important",
            md: "16px !important",
          },
        }}
      >
        <Alert
          onClose={() => setOpen(false)}
          severity={current.severity ?? "info"}
          variant="filled"
          elevation={6}
          action={current.action}
          sx={{
            borderRadius: 2,
            minWidth: 280,
            maxWidth: 480,
            alignItems: "center",
          }}
        >
          {current.message}
        </Alert>
      </Snackbar>
    </SnackbarContext.Provider>
  );
}

// ─── Hook ──────────────────────────────────────────────────────────────────

export function useSnackbar(): SnackbarContextValue {
  const ctx = useContext(SnackbarContext);
  if (!ctx) {
    throw new Error("useSnackbar must be used inside <SnackbarProvider>.");
  }
  return ctx;
}
