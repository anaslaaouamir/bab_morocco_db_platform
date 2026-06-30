"use client";

import React, { useCallback, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Skeleton from "@mui/material/Skeleton";
import GroupRoundedIcon from "@mui/icons-material/GroupRounded";
import PersonAddRoundedIcon from "@mui/icons-material/PersonAddRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";

import { authApi, ApiError, type UserOut } from "@/lib/api";
import { useSnackbar } from "@/contexts/SnackbarContext";

interface CreateForm { email: string; fullName: string }
interface FormErrors { email?: string; fullName?: string }

function validate(v: CreateForm): FormErrors {
  const e: FormErrors = {};
  if (!v.email.trim() || !/^\S+@\S+\.\S+$/.test(v.email)) e.email = "Email valide requis.";
  if (!v.fullName.trim()) e.fullName = "Le nom complet est requis.";
  return e;
}

export default function UserManagementPanel() {
  const { showSnackbar } = useSnackbar();

  const [users, setUsers] = useState<UserOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const result = await authApi.listUsers();
      setUsers(result.filter((u) => u.role === "commercial"));
    } catch (err) {
      setFetchError(
        err instanceof ApiError ? err.detail : "Impossible de charger les comptes.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // ── Create dialog ──────────────────────────────────────────────
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<CreateForm>({ email: "", fullName: "" });
  const [errors, setErrors] = useState<FormErrors>({});
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);

  function openDialog() {
    setForm({ email: "", fullName: "" });
    setErrors({});
    setAttempted(false);
    setCreatedPassword(null);
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
  }

  function set<K extends keyof CreateForm>(key: K, value: CreateForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (attempted) setErrors((prev) => { const e = { ...prev }; delete e[key as keyof FormErrors]; return e; });
  }

  async function handleCreate() {
    setAttempted(true);
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    try {
      const result = await authApi.createUser(form.email, form.fullName);
      setCreatedPassword(result.temporary_password);
      setUsers((prev) => [...prev, result.user]);
      showSnackbar({ message: `Compte ${result.user.email} créé.`, severity: "success", duration: 4000 });
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : "Erreur réseau — compte non créé.";
      showSnackbar({ message: msg, severity: "error", duration: 6000 });
    } finally {
      setSubmitting(false);
    }
  }

  function copyPassword() {
    if (!createdPassword) return;
    navigator.clipboard.writeText(createdPassword);
    showSnackbar({ message: "Mot de passe copié.", severity: "info", duration: 2500 });
  }

  return (
    <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden", mt: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 2.5, py: 2, bgcolor: "action.hover" }}>
        <GroupRoundedIcon sx={{ color: "secondary.main", fontSize: 22 }} />
        <Typography variant="titleMedium" sx={{ fontWeight: 700, flex: 1 }}>
          Comptes Commercial
        </Typography>
        <Button
          variant="contained"
          size="small"
          disableElevation
          startIcon={<PersonAddRoundedIcon />}
          onClick={openDialog}
          sx={{ textTransform: "none", fontWeight: 700 }}
        >
          Créer un compte Commercial
        </Button>
      </Box>

      <Divider />

      <Box sx={{ px: 2.5, py: 2 }}>
        {fetchError && (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={fetchUsers}>
                Réessayer
              </Button>
            }
          >
            {fetchError}
          </Alert>
        )}

        {loading && !fetchError && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} variant="rounded" height={36} sx={{ borderRadius: 1.5 }} />
            ))}
          </Box>
        )}

        {!loading && !fetchError && users.length === 0 && (
          <Typography variant="bodySmall" color="text.secondary">
            Aucun compte Commercial pour le moment.
          </Typography>
        )}

        {!loading && !fetchError && users.length > 0 && (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Nom complet</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Statut</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>{u.full_name}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
                    <Chip
                      label={u.is_active ? "Actif" : "Inactif"}
                      size="small"
                      color={u.is_active ? "success" : "default"}
                      variant="outlined"
                      sx={{ fontSize: "0.6875rem" }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Box>

      {/* Create account dialog */}
      <Dialog open={dialogOpen} onClose={closeDialog} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 3, py: 2, borderBottom: 1, borderColor: "divider" }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="titleLarge" sx={{ fontWeight: 700 }}>
              Nouveau compte Commercial
            </Typography>
          </Box>
          <IconButton onClick={closeDialog} size="small">
            <CloseRoundedIcon fontSize="small" />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ px: 3, py: 3, display: "flex", flexDirection: "column", gap: 2 }}>
          {createdPassword ? (
            <Alert severity="warning" sx={{ "& .MuiAlert-message": { width: "100%" } }}>
              <Typography variant="bodySmall" sx={{ fontWeight: 700, mb: 1, display: "block" }}>
                Mot de passe temporaire — ne sera plus affiché.
              </Typography>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  bgcolor: "background.paper",
                  borderRadius: 1.5,
                  px: 1.5,
                  py: 1,
                }}
              >
                <Typography variant="bodyMedium" sx={{ fontFamily: "monospace", flex: 1, wordBreak: "break-all" }}>
                  {createdPassword}
                </Typography>
                <IconButton size="small" onClick={copyPassword}>
                  <ContentCopyRoundedIcon fontSize="small" />
                </IconButton>
              </Box>
            </Alert>
          ) : (
            <>
              <TextField
                label="Email"
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                error={!!errors.email}
                helperText={errors.email}
                fullWidth
                disabled={submitting}
              />
              <TextField
                label="Nom complet"
                value={form.fullName}
                onChange={(e) => set("fullName", e.target.value)}
                error={!!errors.fullName}
                helperText={errors.fullName}
                fullWidth
                disabled={submitting}
              />
            </>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2, borderTop: 1, borderColor: "divider" }}>
          {createdPassword ? (
            <Button onClick={closeDialog} variant="contained" disableElevation sx={{ textTransform: "none", fontWeight: 700 }}>
              Fermer
            </Button>
          ) : (
            <>
              <Button onClick={closeDialog} disabled={submitting} sx={{ textTransform: "none" }}>
                Annuler
              </Button>
              <Button
                onClick={handleCreate}
                variant="contained"
                disableElevation
                disabled={submitting}
                startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : <PersonAddRoundedIcon />}
                sx={{ textTransform: "none", fontWeight: 700 }}
              >
                {submitting ? "Création…" : "Créer le compte"}
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
