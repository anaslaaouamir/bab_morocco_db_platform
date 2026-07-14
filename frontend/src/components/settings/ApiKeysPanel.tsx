"use client";

import React, { useCallback, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Skeleton from "@mui/material/Skeleton";
import Alert from "@mui/material/Alert";
import InputAdornment from "@mui/material/InputAdornment";
import VpnKeyRoundedIcon from "@mui/icons-material/VpnKeyRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import VisibilityOffRoundedIcon from "@mui/icons-material/VisibilityOffRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import StorageRoundedIcon from "@mui/icons-material/StorageRounded";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";

import { apiSettingsApi, type ApiKeyInfo } from "@/lib/api";
import { useSnackbar } from "@/contexts/SnackbarContext";

const SOURCE_LABELS: Record<string, string> = {
  database: "Base de données",
  env_file: "Fichier .env",
  not_set: "Non configurée",
};

const SOURCE_COLORS: Record<string, "primary" | "default" | "warning"> = {
  database: "primary",
  env_file: "default",
  not_set: "warning",
};

const SOURCE_ICONS: Record<string, React.ReactNode> = {
  database: <StorageRoundedIcon sx={{ fontSize: 14 }} />,
  env_file: <InsertDriveFileOutlinedIcon sx={{ fontSize: 14 }} />,
};

export default function ApiKeysPanel() {
  const { showSnackbar } = useSnackbar();

  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [showValue, setShowValue] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiSettingsApi.getKeys();
      setKeys(res.keys);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function startEdit(keyName: string) {
    setEditingKey(keyName);
    setEditValue("");
    setShowValue(false);
  }

  function cancelEdit() {
    setEditingKey(null);
    setEditValue("");
    setShowValue(false);
  }

  async function handleSave(keyName: string) {
    if (!editValue.trim()) {
      showSnackbar({ message: "La clé ne peut pas être vide.", severity: "warning", duration: 3000 });
      return;
    }
    setSaving(true);
    try {
      const updated = await apiSettingsApi.updateKey(keyName, editValue.trim());
      setKeys((prev) => prev.map((k) => (k.key === keyName ? updated : k)));
      setEditingKey(null);
      setEditValue("");
      showSnackbar({ message: "Clé API enregistrée.", severity: "success", duration: 3000 });
    } catch (e: unknown) {
      showSnackbar({
        message: e instanceof Error ? e.message : "Erreur lors de l'enregistrement.",
        severity: "error",
        duration: 5000,
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(keyName: string) {
    setSaving(true);
    try {
      const updated = await apiSettingsApi.deleteKey(keyName);
      setKeys((prev) => prev.map((k) => (k.key === keyName ? updated : k)));
      showSnackbar({ message: "Clé supprimée de la base. Retour au fichier .env si disponible.", severity: "info", duration: 4000 });
    } catch (e: unknown) {
      showSnackbar({
        message: e instanceof Error ? e.message : "Erreur lors de la suppression.",
        severity: "error",
        duration: 5000,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden", mb: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 2.5, py: 2, bgcolor: "action.hover" }}>
        <VpnKeyRoundedIcon sx={{ color: "primary.main", fontSize: 22 }} />
        <Typography variant="titleMedium" sx={{ fontWeight: 700, flex: 1 }}>
          Clés API
        </Typography>
      </Box>

      <Divider />

      <Box sx={{ px: 2.5, py: 2 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} variant="rounded" height={56} sx={{ borderRadius: 2 }} />
            ))}
          </Box>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            {keys.map((k) => (
              <Paper
                key={k.key}
                variant="outlined"
                sx={{ px: 2, py: 1.5, borderRadius: 2 }}
              >
                {editingKey === k.key ? (
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                    <Typography variant="bodySmall" sx={{ fontWeight: 700 }}>
                      {k.label}
                    </Typography>
                    <TextField
                      size="small"
                      type={showValue ? "text" : "password"}
                      placeholder="Coller la nouvelle clé…"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      disabled={saving}
                      fullWidth
                      autoFocus
                      slotProps={{
                        input: {
                          endAdornment: (
                            <InputAdornment position="end">
                              <IconButton
                                size="small"
                                onClick={() => setShowValue(!showValue)}
                                edge="end"
                              >
                                {showValue ? <VisibilityOffRoundedIcon fontSize="small" /> : <VisibilityRoundedIcon fontSize="small" />}
                              </IconButton>
                            </InputAdornment>
                          ),
                        },
                      }}
                    />
                    <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
                      <Button
                        size="small"
                        onClick={cancelEdit}
                        disabled={saving}
                        startIcon={<CloseRoundedIcon />}
                        sx={{ textTransform: "none" }}
                      >
                        Annuler
                      </Button>
                      <Button
                        size="small"
                        variant="contained"
                        disableElevation
                        onClick={() => handleSave(k.key)}
                        disabled={saving || !editValue.trim()}
                        startIcon={<CheckRoundedIcon />}
                        sx={{ textTransform: "none", fontWeight: 700 }}
                      >
                        {saving ? "Enregistrement…" : "Enregistrer"}
                      </Button>
                    </Box>
                  </Box>
                ) : (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
                    <Typography variant="bodySmall" sx={{ fontWeight: 700, minWidth: 160 }}>
                      {k.label}
                    </Typography>
                    <Typography
                      variant="bodySmall"
                      sx={{
                        flex: 1,
                        fontFamily: "monospace",
                        color: k.is_set ? "text.secondary" : "text.disabled",
                        minWidth: 100,
                      }}
                    >
                      {k.is_set ? k.masked_value : "Non configurée"}
                    </Typography>
                    <Chip
                      icon={SOURCE_ICONS[k.source] as React.ReactElement | undefined}
                      label={SOURCE_LABELS[k.source]}
                      size="small"
                      color={SOURCE_COLORS[k.source]}
                      variant="outlined"
                      sx={{ fontSize: "0.6875rem" }}
                    />
                    <IconButton size="small" onClick={() => startEdit(k.key)} title="Modifier">
                      <EditRoundedIcon fontSize="small" />
                    </IconButton>
                    {k.source === "database" && (
                      <IconButton
                        size="small"
                        onClick={() => handleDelete(k.key)}
                        disabled={saving}
                        title="Supprimer (retour au .env)"
                        color="error"
                      >
                        <DeleteOutlineRoundedIcon fontSize="small" />
                      </IconButton>
                    )}
                  </Box>
                )}
              </Paper>
            ))}
          </Box>
        )}

        <Alert
          severity="info"
          sx={{ mt: 2, borderRadius: 2, "& .MuiAlert-message": { fontSize: "0.8125rem" } }}
        >
          Les clés enregistrées ici prennent priorité sur le fichier .env. Supprimer une clé restaure la valeur .env si elle existe.
        </Alert>
      </Box>
    </Paper>
  );
}
