"use client"; // Next.js requires error boundaries to be Client Components

import { useEffect } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";

/**
 * Global route-level error boundary (Next.js App Router).
 * `error` is the thrown Error; `reset` re-renders the segment.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // In production, send to Sentry / CloudWatch here.
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        p: 3,
      }}
    >
      <Paper
        elevation={0}
        variant="outlined"
        sx={{
          maxWidth: 440,
          width: "100%",
          borderRadius: 3,
          p: { xs: 3, md: 4 },
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 2,
          textAlign: "center",
        }}
      >
        <Box
          sx={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            bgcolor: "error.light",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ErrorOutlineRoundedIcon sx={{ color: "error.contrastText", fontSize: 28 }} />
        </Box>

        <Box>
          <Typography variant="headlineSmall" sx={{ mb: 0.5 }}>
            Une erreur est survenue
          </Typography>
          <Typography variant="bodyMedium" color="text.secondary">
            {process.env.NODE_ENV === "development"
              ? error.message
              : "Quelque chose s'est mal passé. Veuillez réessayer ou contacter l'équipe technique."}
          </Typography>
          {error.digest && (
            <Typography
              variant="bodySmall"
              color="text.disabled"
              sx={{ mt: 1, fontFamily: "monospace", fontSize: "0.6875rem" }}
            >
              Code : {error.digest}
            </Typography>
          )}
        </Box>

        <Button
          variant="contained"
          color="primary"
          onClick={reset}
          startIcon={<RefreshRoundedIcon />}
          disableElevation
          sx={{ mt: 1 }}
        >
          Réessayer
        </Button>
      </Paper>
    </Box>
  );
}
