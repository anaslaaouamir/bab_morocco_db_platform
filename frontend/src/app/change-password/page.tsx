"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import LockResetRoundedIcon from "@mui/icons-material/LockResetRounded";

import { authApi } from "@/lib/api/auth";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

export default function ChangePasswordPage() {
  const router = useRouter();
  const { user, isLoading, logout } = useAuth();

  const isForced = !isLoading && user?.must_change_password === true;

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {};
    if (!currentPassword) errs.currentPassword = "Requis.";
    if (newPassword.length < 8) errs.newPassword = "Minimum 8 caractères.";
    if (newPassword && newPassword === currentPassword)
      errs.newPassword = "Le nouveau mot de passe doit être différent.";
    if (confirmPassword !== newPassword) errs.confirmPassword = "Les mots de passe ne correspondent pas.";
    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    const errs = validate();
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      // Full reload so AuthContext re-hydrates /auth/me and gets must_change_password=false.
      window.location.href = "/";
    } catch (err) {
      setServerError(err instanceof ApiError ? err.detail : "Erreur réseau — réessayez.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "background.default",
        px: 2,
      }}
    >
      <Paper
        variant="outlined"
        component="form"
        onSubmit={handleSubmit}
        sx={{ width: "100%", maxWidth: 420, borderRadius: 3, p: { xs: 3, sm: 4 } }}
      >
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", mb: 3 }}>
          <Box sx={{ width: 56, height: 56, borderRadius: "50%", overflow: "hidden", mb: 2 }}>
            <Image
              src="/favicon.png"
              alt="Bab Morocco"
              width={56}
              height={56}
              style={{ objectFit: "cover", width: "100%", height: "100%" }}
              priority
            />
          </Box>
          <Typography variant="headlineSmall" component="h1" sx={{ textAlign: "center" }}>
            {isForced ? "Changement de mot de passe requis" : "Changer le mot de passe"}
          </Typography>
          {isForced && (
            <Typography variant="bodySmall" color="text.secondary" sx={{ textAlign: "center", mt: 0.5 }}>
              Vous devez définir un nouveau mot de passe avant de continuer.
            </Typography>
          )}
        </Box>

        {serverError && (
          <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
            {serverError}
          </Alert>
        )}

        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <TextField
            label="Mot de passe actuel"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            error={!!fieldErrors.currentPassword}
            helperText={fieldErrors.currentPassword}
            required
            fullWidth
            disabled={submitting}
          />
          <TextField
            label="Nouveau mot de passe"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            error={!!fieldErrors.newPassword}
            helperText={fieldErrors.newPassword ?? "Minimum 8 caractères."}
            required
            fullWidth
            disabled={submitting}
          />
          <TextField
            label="Confirmer le nouveau mot de passe"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            error={!!fieldErrors.confirmPassword}
            helperText={fieldErrors.confirmPassword}
            required
            fullWidth
            disabled={submitting}
          />

          <Button
            type="submit"
            variant="contained"
            disableElevation
            size="large"
            disabled={submitting}
            startIcon={submitting ? <CircularProgress size={18} color="inherit" /> : <LockResetRoundedIcon />}
            sx={{ mt: 1, textTransform: "none", fontWeight: 700 }}
          >
            {submitting ? "Enregistrement…" : "Enregistrer le mot de passe"}
          </Button>

          {!isForced && (
            <Button
              variant="text"
              startIcon={<ArrowBackRoundedIcon />}
              onClick={() => router.back()}
              disabled={submitting}
              sx={{ textTransform: "none", alignSelf: "center" }}
            >
              Retour
            </Button>
          )}

          {isForced && (
            <Button
              variant="text"
              size="small"
              onClick={logout}
              disabled={submitting}
              sx={{ textTransform: "none", alignSelf: "center", color: "text.secondary" }}
            >
              Se déconnecter
            </Button>
          )}
        </Box>
      </Paper>
    </Box>
  );
}
