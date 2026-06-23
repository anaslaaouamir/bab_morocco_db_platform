import React from "react";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Typography from "@mui/material/Typography";

// ─── Props ─────────────────────────────────────────────────────────────────

export interface ConfirmationDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Controls the colour of the confirm button. Defaults to "primary". */
  confirmColor?: "primary" | "error" | "warning" | "success";
  /** Shows a spinner and disables both buttons while an async action runs. */
  loading?: boolean;
}

// ─── Component ─────────────────────────────────────────────────────────────

export default function ConfirmationDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  confirmColor = "primary",
  loading = false,
}: ConfirmationDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={loading ? undefined : onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          px: 1,
          py: 0.5,
        },
      }}
    >
      <DialogTitle sx={{ pb: description ? 0.5 : 0 }}>
        <Typography variant="titleLarge" component="span">
          {title}
        </Typography>
      </DialogTitle>

      {description && (
        <DialogContent>
          {typeof description === "string" ? (
            <Typography variant="bodyMedium" color="text.secondary">
              {description}
            </Typography>
          ) : (
            description
          )}
        </DialogContent>
      )}

      <DialogActions sx={{ px: 2, pb: 2, pt: 1, gap: 1 }}>
        <Button
          onClick={onClose}
          variant="text"
          disabled={loading}
          sx={{ fontWeight: 600 }}
        >
          {cancelLabel}
        </Button>

        <Button
          onClick={onConfirm}
          variant="contained"
          color={confirmColor}
          disabled={loading}
          disableElevation
          startIcon={
            loading ? (
              <CircularProgress size={14} color="inherit" thickness={4} />
            ) : undefined
          }
          sx={{ fontWeight: 600, minWidth: 110 }}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
