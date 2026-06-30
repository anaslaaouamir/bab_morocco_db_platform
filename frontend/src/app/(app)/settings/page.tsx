"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import Slider from "@mui/material/Slider";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import CircularProgress from "@mui/material/CircularProgress";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";

import { useSettings } from "@/lib/settingsStore";
import { useSnackbar } from "@/contexts/SnackbarContext";
import { useAuth } from "@/contexts/AuthContext";
import UserManagementPanel from "@/components/settings/UserManagementPanel";

// ─── Hour display helper ─────────────────────────────────────────────────────

function fmtHour(h: number) {
  return `${String(h).padStart(2, "0")}:00`;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const router = useRouter();
  const { user, isLoading, isAdmin } = useAuth();
  const { settings, updateSettings } = useSettings();
  const { showSnackbar } = useSnackbar();

  // Settings is Admin-only (Commercials cannot access the scheduler).
  // Redirect as soon as the user is known; render nothing while loading or
  // redirecting to avoid a flash of restricted content.
  useEffect(() => {
    if (!isLoading && user && !isAdmin) {
      router.replace("/");
    }
  }, [isLoading, user, isAdmin, router]);

  // Local draft — only persisted on Save
  const [draft, setDraft] = useState(() => ({ ...settings.scheduledScan }));

  // Keep draft in sync when settings load from localStorage on mount
  React.useEffect(() => {
    setDraft({ ...settings.scheduledScan });
  }, [settings.scheduledScan.enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const windowDurationH = draft.windowEndHour - draft.windowStartHour > 0
    ? draft.windowEndHour - draft.windowStartHour
    : draft.windowEndHour + 24 - draft.windowStartHour;

  const exampleTypes = 3;
  const exampleLimiteParType = Math.floor(60 / exampleTypes);
  const exampleBatches = Math.ceil(exampleLimiteParType / draft.batchSize) * exampleTypes;
  const exampleInterval = exampleBatches > 1
    ? Math.round((windowDurationH * 60) / (exampleBatches - 1))
    : windowDurationH * 60;

  function save() {
    updateSettings({ scheduledScan: draft });
    showSnackbar({ message: "Paramètres enregistrés.", severity: "success", duration: 3000 });
  }

  // While auth is resolving, or while a non-Admin is being redirected away,
  // render nothing to avoid a flash of restricted content.
  if (isLoading || !user || !isAdmin) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
    <Box sx={{ px: { xs: 2, sm: 3, md: 4 }, pt: { xs: 2, md: 3 }, pb: 6, maxWidth: 640 }}>
      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 3 }}>
        <SettingsRoundedIcon sx={{ color: "text.secondary", fontSize: 28 }} />
        <Box>
          <Typography variant="headlineMedium" component="h1">
            Paramètres
          </Typography>
          <Typography variant="bodyMedium" color="text.secondary">
            Configuration de la plateforme BD Intelligence
          </Typography>
        </Box>
      </Box>

      {/* ── Scan planifié ─────────────────────────────────────────── */}
      <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}>
        {/* Section header */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 2.5, py: 2, bgcolor: "action.hover" }}>
          <ScheduleRoundedIcon sx={{ color: "secondary.main", fontSize: 22 }} />
          <Typography variant="titleMedium" sx={{ fontWeight: 700, flex: 1 }}>
            Scan planifié
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={draft.enabled}
                onChange={(e) => setDraft((d) => ({ ...d, enabled: e.target.checked }))}
                color="secondary"
              />
            }
            label={
              <Typography variant="labelMedium" sx={{ fontWeight: 700, color: draft.enabled ? "secondary.main" : "text.disabled" }}>
                {draft.enabled ? "Activé" : "Désactivé"}
              </Typography>
            }
            labelPlacement="start"
            sx={{ mr: 0, ml: 0 }}
          />
        </Box>

        <Divider />

        <Box sx={{ px: 2.5, py: 2.5, display: "flex", flexDirection: "column", gap: 3 }}>
          <Alert
            severity={draft.enabled ? "info" : "warning"}
            icon={<InfoOutlinedIcon fontSize="small" />}
            sx={{ borderRadius: 2, "& .MuiAlert-message": { fontSize: "0.8125rem" } }}
          >
            {draft.enabled
              ? "Les scans seront fractionnés en lots et planifiés pendant la fenêtre horaire configurée. Le navigateur doit rester ouvert pendant la fenêtre pour que les scans s'exécutent."
              : "Lorsque désactivé, les scans s'exécutent immédiatement (comportement par défaut)."}
          </Alert>

          {/* ── Window start ─────────────────────────────────────── */}
          <Box sx={{ opacity: draft.enabled ? 1 : 0.4, pointerEvents: draft.enabled ? "auto" : "none" }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
              <Typography variant="bodyMedium" sx={{ fontWeight: 600 }}>Heure de début</Typography>
              <Chip label={fmtHour(draft.windowStartHour)} size="small" color="secondary" variant="outlined" />
            </Box>
            <Slider
              value={draft.windowStartHour}
              min={0} max={23} step={1}
              color="secondary"
              valueLabelDisplay="auto"
              valueLabelFormat={fmtHour}
              marks={[
                { value: 0,  label: "00h" },
                { value: 6,  label: "06h" },
                { value: 12, label: "12h" },
                { value: 18, label: "18h" },
                { value: 23, label: "23h" },
              ]}
              onChange={(_, v) => setDraft((d) => ({ ...d, windowStartHour: v as number }))}
              sx={{ "& .MuiSlider-markLabel": { fontSize: "0.625rem" } }}
            />
          </Box>

          {/* ── Window end ───────────────────────────────────────── */}
          <Box sx={{ opacity: draft.enabled ? 1 : 0.4, pointerEvents: draft.enabled ? "auto" : "none" }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
              <Typography variant="bodyMedium" sx={{ fontWeight: 600 }}>Heure de fin</Typography>
              <Chip label={fmtHour(draft.windowEndHour)} size="small" color="secondary" variant="outlined" />
            </Box>
            <Slider
              value={draft.windowEndHour}
              min={0} max={23} step={1}
              color="secondary"
              valueLabelDisplay="auto"
              valueLabelFormat={fmtHour}
              marks={[
                { value: 0,  label: "00h" },
                { value: 6,  label: "06h" },
                { value: 12, label: "12h" },
                { value: 18, label: "18h" },
                { value: 23, label: "23h" },
              ]}
              onChange={(_, v) => setDraft((d) => ({ ...d, windowEndHour: v as number }))}
              sx={{ "& .MuiSlider-markLabel": { fontSize: "0.625rem" } }}
            />
          </Box>

          {/* ── Batch size ───────────────────────────────────────── */}
          <Box sx={{ opacity: draft.enabled ? 1 : 0.4, pointerEvents: draft.enabled ? "auto" : "none" }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
              <Typography variant="bodyMedium" sx={{ fontWeight: 600 }}>Taille des lots</Typography>
              <Chip label={`${draft.batchSize} prospects / lot`} size="small" color="secondary" variant="outlined" />
            </Box>
            <Slider
              value={draft.batchSize}
              min={5} max={50} step={5}
              color="secondary"
              valueLabelDisplay="auto"
              marks={[
                { value: 5,  label: "5"  },
                { value: 20, label: "20" },
                { value: 50, label: "50" },
              ]}
              onChange={(_, v) => setDraft((d) => ({ ...d, batchSize: v as number }))}
              sx={{ "& .MuiSlider-markLabel": { fontSize: "0.625rem" } }}
            />
            <Typography variant="bodySmall" color="text.secondary" sx={{ mt: 0.5 }}>
              Nombre maximum de prospects par appel API. Plus petit = moins de charge serveur.
            </Typography>
          </Box>

          {/* ── Preview ──────────────────────────────────────────── */}
          {draft.enabled && (
            <Alert
              severity="success"
              icon={<ScheduleRoundedIcon fontSize="small" />}
              sx={{ borderRadius: 2, "& .MuiAlert-message": { fontSize: "0.8125rem" } }}
            >
              <Typography variant="bodySmall" sx={{ fontWeight: 700, mb: 0.5, display: "block" }}>
                Exemple — 60 prospects · 3 types
              </Typography>
              <Typography variant="bodySmall" color="text.secondary">
                Fenêtre : {fmtHour(draft.windowStartHour)} → {fmtHour(draft.windowEndHour)} ({windowDurationH}h)
                · {exampleBatches} lots de {draft.batchSize} max
                · 1 lot toutes les ~{exampleInterval} min
              </Typography>
            </Alert>
          )}
        </Box>
      </Paper>

      {/* ── Comptes Commercial ────────────────────────────────────── */}
      <UserManagementPanel />

      {/* Save */}
      <Box sx={{ mt: 3, display: "flex", justifyContent: "flex-end" }}>
        <Button
          variant="contained"
          disableElevation
          startIcon={<CheckRoundedIcon />}
          onClick={save}
          sx={{ textTransform: "none", fontWeight: 700 }}
        >
          Enregistrer les paramètres
        </Button>
      </Box>
    </Box>
  );
}
