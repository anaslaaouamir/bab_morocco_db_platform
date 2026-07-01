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
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Select from "@mui/material/Select";
import InputLabel from "@mui/material/InputLabel";
import FormControl from "@mui/material/FormControl";
import GroupRoundedIcon from "@mui/icons-material/GroupRounded";
import PersonAddRoundedIcon from "@mui/icons-material/PersonAddRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import MoreVertRoundedIcon from "@mui/icons-material/MoreVertRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import BlockRoundedIcon from "@mui/icons-material/BlockRounded";
import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded";
import LockResetRoundedIcon from "@mui/icons-material/LockResetRounded";

import { authApi, prospectsApi, ApiError, type UserOut } from "@/lib/api";
import { useSnackbar } from "@/contexts/SnackbarContext";

// ─── Types ───────────────────────────────────────────────────────────────────

interface CreateForm { email: string; fullName: string }
interface CreateFormErrors { email?: string; fullName?: string }

interface EditForm { fullName: string; email: string }
interface EditFormErrors { fullName?: string; email?: string }

function validateCreate(v: CreateForm): CreateFormErrors {
  const e: CreateFormErrors = {};
  if (!v.email.trim() || !/^\S+@\S+\.\S+$/.test(v.email)) e.email = "Email valide requis.";
  if (!v.fullName.trim()) e.fullName = "Le nom complet est requis.";
  return e;
}

function validateEdit(v: EditForm): EditFormErrors {
  const e: EditFormErrors = {};
  if (!v.fullName.trim()) e.fullName = "Le nom complet est requis.";
  if (!v.email.trim() || !/^\S+@\S+\.\S+$/.test(v.email)) e.email = "Email valide requis.";
  return e;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "Jamais";
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ─── Main component ──────────────────────────────────────────────────────────

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
      setFetchError(err instanceof ApiError ? err.detail : "Impossible de charger les comptes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // ── Row actions menu ────────────────────────────────────────────────────────
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [menuUser, setMenuUser] = useState<UserOut | null>(null);

  function openMenu(e: React.MouseEvent<HTMLElement>, u: UserOut) {
    setMenuAnchor(e.currentTarget);
    setMenuUser(u);
  }
  function closeMenu() { setMenuAnchor(null); setMenuUser(null); }

  // ── Create dialog ───────────────────────────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>({ email: "", fullName: "" });
  const [createErrors, setCreateErrors] = useState<CreateFormErrors>({});
  const [createAttempted, setCreateAttempted] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);

  function openCreate() {
    setCreateForm({ email: "", fullName: "" });
    setCreateErrors({});
    setCreateAttempted(false);
    setCreatedPassword(null);
    setCreateOpen(true);
  }
  function closeCreate() { setCreateOpen(false); }

  function setCreate<K extends keyof CreateForm>(key: K, value: string) {
    setCreateForm((p) => ({ ...p, [key]: value }));
    if (createAttempted) setCreateErrors((p) => { const e = { ...p }; delete e[key]; return e; });
  }

  async function handleCreate() {
    setCreateAttempted(true);
    const errs = validateCreate(createForm);
    setCreateErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setCreateSubmitting(true);
    try {
      const result = await authApi.createUser(createForm.email, createForm.fullName);
      setCreatedPassword(result.temporary_password);
      setUsers((p) => [...p, result.user]);
      showSnackbar({ message: `Compte ${result.user.email} créé.`, severity: "success", duration: 4000 });
    } catch (err) {
      showSnackbar({ message: err instanceof ApiError ? err.detail : "Erreur réseau.", severity: "error", duration: 6000 });
    } finally {
      setCreateSubmitting(false);
    }
  }

  function copyPassword(pw: string) {
    navigator.clipboard.writeText(pw);
    showSnackbar({ message: "Mot de passe copié.", severity: "info", duration: 2500 });
  }

  // ── Edit dialog ──────────────────────────────────────────────────────────────
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<UserOut | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ fullName: "", email: "" });
  const [editErrors, setEditErrors] = useState<EditFormErrors>({});
  const [editAttempted, setEditAttempted] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);

  function openEdit(u: UserOut) {
    setEditTarget(u);
    setEditForm({ fullName: u.full_name, email: u.email });
    setEditErrors({});
    setEditAttempted(false);
    setEditOpen(true);
    closeMenu();
  }
  function closeEdit() { setEditOpen(false); }

  function setEdit<K extends keyof EditForm>(key: K, value: string) {
    setEditForm((p) => ({ ...p, [key]: value }));
    if (editAttempted) setEditErrors((p) => { const e = { ...p }; delete e[key]; return e; });
  }

  async function handleEdit() {
    if (!editTarget) return;
    setEditAttempted(true);
    const errs = validateEdit(editForm);
    setEditErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setEditSubmitting(true);
    try {
      const updated = await authApi.updateUser(editTarget.id, {
        full_name: editForm.fullName,
        email: editForm.email,
      });
      setUsers((p) => p.map((u) => (u.id === updated.id ? updated : u)));
      showSnackbar({ message: "Compte mis à jour.", severity: "success", duration: 3000 });
      closeEdit();
    } catch (err) {
      showSnackbar({ message: err instanceof ApiError ? err.detail : "Erreur réseau.", severity: "error", duration: 6000 });
    } finally {
      setEditSubmitting(false);
    }
  }

  // ── Deactivate / Reactivate flow ─────────────────────────────────────────────
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<UserOut | null>(null);
  const [deactivateLoading, setDeactivateLoading] = useState(false);
  const [prospectIds, setProspectIds] = useState<string[]>([]);
  const [reassignTo, setReassignTo] = useState<string>("");

  async function openDeactivate(u: UserOut) {
    closeMenu();
    setDeactivateTarget(u);
    setReassignTo("");
    setDeactivateLoading(true);
    setDeactivateOpen(true);
    try {
      const result = await prospectsApi.list({ assignedToFilter: u.id, pageSize: 100 });
      setProspectIds(result.items.map((p) => p.id));
    } catch {
      setProspectIds([]);
    } finally {
      setDeactivateLoading(false);
    }
  }
  function closeDeactivate() { setDeactivateOpen(false); setDeactivateTarget(null); setProspectIds([]); }

  async function handleDeactivate() {
    if (!deactivateTarget) return;
    setDeactivateLoading(true);
    try {
      if (prospectIds.length > 0 && reassignTo) {
        await Promise.all(prospectIds.map((pid) => prospectsApi.assign(pid, reassignTo)));
      } else if (prospectIds.length > 0 && !reassignTo) {
        await Promise.all(prospectIds.map((pid) => prospectsApi.assign(pid, null)));
      }
      const updated = await authApi.updateUser(deactivateTarget.id, { is_active: false });
      setUsers((p) => p.map((u) => (u.id === updated.id ? updated : u)));
      showSnackbar({ message: `${updated.full_name} a été désactivé.`, severity: "success", duration: 4000 });
      closeDeactivate();
    } catch (err) {
      showSnackbar({ message: err instanceof ApiError ? err.detail : "Erreur réseau.", severity: "error", duration: 6000 });
    } finally {
      setDeactivateLoading(false);
    }
  }

  async function handleReactivate(u: UserOut) {
    closeMenu();
    try {
      const updated = await authApi.updateUser(u.id, { is_active: true });
      setUsers((p) => p.map((x) => (x.id === updated.id ? updated : x)));
      showSnackbar({ message: `${updated.full_name} a été réactivé.`, severity: "success", duration: 3000 });
    } catch (err) {
      showSnackbar({ message: err instanceof ApiError ? err.detail : "Erreur réseau.", severity: "error", duration: 6000 });
    }
  }

  // ── Reset password dialog ────────────────────────────────────────────────────
  const [resetOpen, setResetOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<UserOut | null>(null);
  const [resetPassword, setResetPasswordState] = useState<string | null>(null);
  const [resetSubmitting, setResetSubmitting] = useState(false);

  function openReset(u: UserOut) {
    setResetTarget(u);
    setResetPasswordState(null);
    setResetOpen(true);
    closeMenu();
  }
  function closeReset() { setResetOpen(false); }

  async function handleReset() {
    if (!resetTarget) return;
    setResetSubmitting(true);
    try {
      const result = await authApi.resetPassword(resetTarget.id);
      setResetPasswordState(result.temporary_password);
      showSnackbar({ message: "Mot de passe réinitialisé.", severity: "success", duration: 3000 });
    } catch (err) {
      showSnackbar({ message: err instanceof ApiError ? err.detail : "Erreur réseau.", severity: "error", duration: 6000 });
    } finally {
      setResetSubmitting(false);
    }
  }

  const activeCommercials = users.filter((u) => u.is_active);

  // ─── Render ─────────────────────────────────────────────────────────────────
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
          onClick={openCreate}
          sx={{ textTransform: "none", fontWeight: 700 }}
        >
          Créer un compte Commercial
        </Button>
      </Box>

      <Divider />

      <Box sx={{ px: 2.5, py: 2, overflowX: "auto" }}>
        {fetchError && (
          <Alert severity="error" action={<Button color="inherit" size="small" onClick={fetchUsers}>Réessayer</Button>}>
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
                <TableCell>Dernière connexion</TableCell>
                <TableCell>Modifié le</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>{u.full_name}</TableCell>
                  <TableCell sx={{ color: "text.secondary" }}>{u.email}</TableCell>
                  <TableCell>
                    <Chip
                      label={u.is_active ? "Actif" : "Inactif"}
                      size="small"
                      color={u.is_active ? "success" : "default"}
                      variant="outlined"
                      sx={{ fontSize: "0.6875rem" }}
                    />
                  </TableCell>
                  <TableCell sx={{ color: "text.secondary", fontSize: "0.75rem", whiteSpace: "nowrap" }}>
                    {formatDate(u.last_login_at)}
                  </TableCell>
                  <TableCell sx={{ color: "text.secondary", fontSize: "0.75rem", whiteSpace: "nowrap" }}>
                    {formatDate(u.updated_at)}
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={(e) => openMenu(e, u)}>
                      <MoreVertRoundedIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Box>

      {/* Row actions menu */}
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={closeMenu}>
        <MenuItem onClick={() => menuUser && openEdit(menuUser)}>
          <ListItemIcon><EditRoundedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Modifier</ListItemText>
        </MenuItem>
        {menuUser?.is_active ? (
          <MenuItem onClick={() => menuUser && openDeactivate(menuUser)}>
            <ListItemIcon><BlockRoundedIcon fontSize="small" color="error" /></ListItemIcon>
            <ListItemText primaryTypographyProps={{ color: "error" }}>Désactiver</ListItemText>
          </MenuItem>
        ) : (
          <MenuItem onClick={() => menuUser && handleReactivate(menuUser)}>
            <ListItemIcon><CheckCircleOutlineRoundedIcon fontSize="small" color="success" /></ListItemIcon>
            <ListItemText primaryTypographyProps={{ color: "success.main" }}>Réactiver</ListItemText>
          </MenuItem>
        )}
        <MenuItem onClick={() => menuUser && openReset(menuUser)}>
          <ListItemIcon><LockResetRoundedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Réinitialiser le mot de passe</ListItemText>
        </MenuItem>
      </Menu>

      {/* Create account dialog */}
      <Dialog open={createOpen} onClose={closeCreate} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 3, py: 2, borderBottom: 1, borderColor: "divider" }}>
          <Typography variant="titleLarge" sx={{ fontWeight: 700, flex: 1 }}>
            Nouveau compte Commercial
          </Typography>
          <IconButton onClick={closeCreate} size="small"><CloseRoundedIcon fontSize="small" /></IconButton>
        </DialogTitle>

        <DialogContent sx={{ px: 3, py: 3, display: "flex", flexDirection: "column", gap: 2 }}>
          {createdPassword ? (
            <Alert severity="warning" sx={{ "& .MuiAlert-message": { width: "100%" } }}>
              <Typography variant="bodySmall" sx={{ fontWeight: 700, mb: 1, display: "block" }}>
                Mot de passe temporaire — ne sera plus affiché.
              </Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, bgcolor: "background.paper", borderRadius: 1.5, px: 1.5, py: 1 }}>
                <Typography variant="bodyMedium" sx={{ fontFamily: "monospace", flex: 1, wordBreak: "break-all" }}>
                  {createdPassword}
                </Typography>
                <IconButton size="small" onClick={() => copyPassword(createdPassword)}>
                  <ContentCopyRoundedIcon fontSize="small" />
                </IconButton>
              </Box>
            </Alert>
          ) : (
            <>
              <TextField
                label="Email" type="email" value={createForm.email}
                onChange={(e) => setCreate("email", e.target.value)}
                error={!!createErrors.email} helperText={createErrors.email}
                fullWidth disabled={createSubmitting}
              />
              <TextField
                label="Nom complet" value={createForm.fullName}
                onChange={(e) => setCreate("fullName", e.target.value)}
                error={!!createErrors.fullName} helperText={createErrors.fullName}
                fullWidth disabled={createSubmitting}
              />
            </>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2, borderTop: 1, borderColor: "divider" }}>
          {createdPassword ? (
            <Button onClick={closeCreate} variant="contained" disableElevation sx={{ textTransform: "none", fontWeight: 700 }}>
              Fermer
            </Button>
          ) : (
            <>
              <Button onClick={closeCreate} disabled={createSubmitting} sx={{ textTransform: "none" }}>Annuler</Button>
              <Button
                onClick={handleCreate} variant="contained" disableElevation
                disabled={createSubmitting}
                startIcon={createSubmitting ? <CircularProgress size={16} color="inherit" /> : <PersonAddRoundedIcon />}
                sx={{ textTransform: "none", fontWeight: 700 }}
              >
                {createSubmitting ? "Création…" : "Créer le compte"}
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editOpen} onClose={closeEdit} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ display: "flex", alignItems: "center", px: 3, py: 2, borderBottom: 1, borderColor: "divider" }}>
          <Typography variant="titleLarge" sx={{ fontWeight: 700, flex: 1 }}>Modifier le compte</Typography>
          <IconButton onClick={closeEdit} size="small"><CloseRoundedIcon fontSize="small" /></IconButton>
        </DialogTitle>
        <DialogContent sx={{ px: 3, py: 3, display: "flex", flexDirection: "column", gap: 2 }}>
          <TextField
            label="Nom complet" value={editForm.fullName}
            onChange={(e) => setEdit("fullName", e.target.value)}
            error={!!editErrors.fullName} helperText={editErrors.fullName}
            fullWidth disabled={editSubmitting}
          />
          <TextField
            label="Email" type="email" value={editForm.email}
            onChange={(e) => setEdit("email", e.target.value)}
            error={!!editErrors.email} helperText={editErrors.email}
            fullWidth disabled={editSubmitting}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, borderTop: 1, borderColor: "divider" }}>
          <Button onClick={closeEdit} disabled={editSubmitting} sx={{ textTransform: "none" }}>Annuler</Button>
          <Button
            onClick={handleEdit} variant="contained" disableElevation
            disabled={editSubmitting}
            startIcon={editSubmitting ? <CircularProgress size={16} color="inherit" /> : <EditRoundedIcon />}
            sx={{ textTransform: "none", fontWeight: 700 }}
          >
            {editSubmitting ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Deactivate dialog */}
      <Dialog open={deactivateOpen} onClose={closeDeactivate} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ display: "flex", alignItems: "center", px: 3, py: 2, borderBottom: 1, borderColor: "divider" }}>
          <Typography variant="titleLarge" sx={{ fontWeight: 700, flex: 1 }}>
            Désactiver {deactivateTarget?.full_name}
          </Typography>
          <IconButton onClick={closeDeactivate} size="small"><CloseRoundedIcon fontSize="small" /></IconButton>
        </DialogTitle>
        <DialogContent sx={{ px: 3, py: 3, display: "flex", flexDirection: "column", gap: 2 }}>
          {deactivateLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
              <CircularProgress size={28} />
            </Box>
          ) : prospectIds.length > 0 ? (
            <>
              <Alert severity="warning">
                Ce commercial a <strong>{prospectIds.length}</strong> prospect{prospectIds.length > 1 ? "s" : ""} actif{prospectIds.length > 1 ? "s" : ""}.
                Choisissez un responsable ou laissez non assigné.
              </Alert>
              <FormControl fullWidth size="small">
                <InputLabel>Réassigner à</InputLabel>
                <Select
                  value={reassignTo}
                  label="Réassigner à"
                  onChange={(e) => setReassignTo(e.target.value)}
                >
                  <MenuItem value=""><em>Laisser non assigné</em></MenuItem>
                  {activeCommercials
                    .filter((u) => u.id !== deactivateTarget?.id)
                    .map((u) => (
                      <MenuItem key={u.id} value={u.id}>{u.full_name}</MenuItem>
                    ))}
                </Select>
              </FormControl>
            </>
          ) : (
            <Typography variant="bodyMedium">
              Ce commercial n&apos;a aucun prospect actif. Vous pouvez le désactiver sans réassignation.
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, borderTop: 1, borderColor: "divider" }}>
          <Button onClick={closeDeactivate} disabled={deactivateLoading} sx={{ textTransform: "none" }}>Annuler</Button>
          <Button
            onClick={handleDeactivate} variant="contained" color="error" disableElevation
            disabled={deactivateLoading}
            startIcon={deactivateLoading ? <CircularProgress size={16} color="inherit" /> : <BlockRoundedIcon />}
            sx={{ textTransform: "none", fontWeight: 700 }}
          >
            {deactivateLoading ? "Traitement…" : "Désactiver"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reset password dialog */}
      <Dialog open={resetOpen} onClose={closeReset} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ display: "flex", alignItems: "center", px: 3, py: 2, borderBottom: 1, borderColor: "divider" }}>
          <Typography variant="titleLarge" sx={{ fontWeight: 700, flex: 1 }}>Réinitialiser le mot de passe</Typography>
          <IconButton onClick={closeReset} size="small"><CloseRoundedIcon fontSize="small" /></IconButton>
        </DialogTitle>
        <DialogContent sx={{ px: 3, py: 3, display: "flex", flexDirection: "column", gap: 2 }}>
          {resetPassword ? (
            <Alert severity="warning" sx={{ "& .MuiAlert-message": { width: "100%" } }}>
              <Typography variant="bodySmall" sx={{ fontWeight: 700, mb: 1, display: "block" }}>
                Nouveau mot de passe temporaire — ne sera plus affiché.
              </Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, bgcolor: "background.paper", borderRadius: 1.5, px: 1.5, py: 1 }}>
                <Typography variant="bodyMedium" sx={{ fontFamily: "monospace", flex: 1, wordBreak: "break-all" }}>
                  {resetPassword}
                </Typography>
                <IconButton size="small" onClick={() => copyPassword(resetPassword)}>
                  <ContentCopyRoundedIcon fontSize="small" />
                </IconButton>
              </Box>
            </Alert>
          ) : (
            <Typography variant="bodyMedium">
              Un nouveau mot de passe temporaire sera généré pour <strong>{resetTarget?.full_name}</strong>.
              L&apos;utilisateur devra le changer à sa prochaine connexion.
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, borderTop: 1, borderColor: "divider" }}>
          {resetPassword ? (
            <Button onClick={closeReset} variant="contained" disableElevation sx={{ textTransform: "none", fontWeight: 700 }}>
              Fermer
            </Button>
          ) : (
            <>
              <Button onClick={closeReset} disabled={resetSubmitting} sx={{ textTransform: "none" }}>Annuler</Button>
              <Button
                onClick={handleReset} variant="contained" disableElevation
                disabled={resetSubmitting}
                startIcon={resetSubmitting ? <CircularProgress size={16} color="inherit" /> : <LockResetRoundedIcon />}
                sx={{ textTransform: "none", fontWeight: 700 }}
              >
                {resetSubmitting ? "Réinitialisation…" : "Réinitialiser"}
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
