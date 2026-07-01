"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";

import { ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useSnackbar } from "@/contexts/SnackbarContext";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ProfileDialog({ open, onClose }: Props) {
  const { user, updateProfile } = useAuth();
  const { showSnackbar } = useSnackbar();
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && user) setFullName(user.full_name);
  }, [open, user]);

  async function handleSave() {
    if (!fullName.trim()) {
      setNameError("Le nom complet est requis.");
      return;
    }
    setNameError(null);
    setSaving(true);
    try {
      await updateProfile(fullName.trim());
      showSnackbar({ message: "Profil mis à jour.", severity: "success", duration: 3000 });
      onClose();
    } catch (err) {
      showSnackbar({
        message: err instanceof ApiError ? err.detail : "Erreur réseau.",
        severity: "error",
        duration: 5000,
      });
    } finally {
      setSaving(false);
    }
  }

  function handleChangePassword() {
    onClose();
    router.push("/change-password");
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle
        sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 3, py: 2, borderBottom: 1, borderColor: "divider" }}
      >
        <Typography variant="titleLarge" sx={{ fontWeight: 700, flex: 1 }}>
          Mon profil
        </Typography>
        <IconButton onClick={onClose} size="small">
          <CloseRoundedIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ px: 3, py: 3, display: "flex", flexDirection: "column", gap: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Typography variant="bodySmall" color="text.secondary" sx={{ flex: 1 }}>
            {user?.email}
          </Typography>
          <Chip
            label={user?.role === "admin" ? "Administrateur" : "Commercial"}
            size="small"
            color={user?.role === "admin" ? "primary" : "default"}
            variant="outlined"
            sx={{ fontSize: "0.6875rem" }}
          />
        </Box>

        <TextField
          label="Nom complet"
          value={fullName}
          onChange={(e) => {
            setFullName(e.target.value);
            if (nameError) setNameError(null);
          }}
          error={!!nameError}
          helperText={nameError}
          fullWidth
          disabled={saving}
        />

        <Divider />

        <Button
          variant="outlined"
          startIcon={<LockRoundedIcon />}
          onClick={handleChangePassword}
          sx={{ textTransform: "none", alignSelf: "flex-start" }}
        >
          Changer le mot de passe
        </Button>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, borderTop: 1, borderColor: "divider" }}>
        <Button onClick={onClose} disabled={saving} sx={{ textTransform: "none" }}>
          Annuler
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disableElevation
          disabled={saving}
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveRoundedIcon />}
          sx={{ textTransform: "none", fontWeight: 700 }}
        >
          {saving ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
