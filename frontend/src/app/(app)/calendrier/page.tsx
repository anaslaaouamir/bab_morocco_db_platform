"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import IconButton from "@mui/material/IconButton";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";

import { scanApi, ApiError, type RawScanJob } from "@/lib/api";
import { PARTNER_TYPE_LABELS, type PartnerType } from "@/types/prospect";
import { useAuth } from "@/contexts/AuthContext";
import { useSnackbar } from "@/contexts/SnackbarContext";
import ScanProspectDialog from "@/components/crm/ScanProspectDialog";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

const STATUS_LABEL: Record<string, string> = {
  scheduled: "Planifié",
  pending: "En attente",
  running: "En cours",
  done: "Terminé",
  error: "Échoué",
  cancelled: "Annulé",
};

const STATUS_COLOR: Record<string, "info" | "success" | "error" | "default"> = {
  scheduled: "info",
  pending: "info",
  running: "info",
  done: "success",
  error: "error",
  cancelled: "default",
};

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function jobDateKey(job: RawScanJob): string {
  return (job.scheduled_at ?? job.created_at).slice(0, 10);
}

type DayStatus = "none" | "waiting" | "done" | "error";

function dayStatus(dayJobs: RawScanJob[]): DayStatus {
  if (dayJobs.some((j) => j.statut === "error")) return "error";
  if (dayJobs.some((j) => j.statut === "scheduled" || j.statut === "pending" || j.statut === "running")) return "waiting";
  if (dayJobs.some((j) => j.statut === "done")) return "done";
  return "none"; // empty, or only cancelled jobs
}

const STATUS_DOT_COLOR: Record<DayStatus, string | undefined> = {
  none: undefined,
  waiting: "info.main",
  done: "success.main",
  error: "error.main",
};

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CalendrierPage() {
  const router = useRouter();
  const { user, isLoading, isAdmin } = useAuth();
  const { showSnackbar } = useSnackbar();

  // Calendar is Admin-only, same as scan access generally.
  useEffect(() => {
    if (!isLoading && user && !isAdmin) router.replace("/");
  }, [isLoading, user, isAdmin, router]);

  const [jobs, setJobs] = useState<RawScanJob[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; });
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [scanDialogDate, setScanDialogDate] = useState<Date | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  async function reload() {
    setLoadingJobs(true);
    try {
      setJobs(await scanApi.history());
    } catch (err) {
      showSnackbar({
        message: err instanceof ApiError ? err.detail : "Erreur réseau lors du chargement du calendrier.",
        severity: "error",
        duration: 6000,
      });
    } finally {
      setLoadingJobs(false);
    }
  }

  useEffect(() => { reload(); }, []);

  const jobsByDay = useMemo(() => {
    const map = new Map<string, RawScanJob[]>();
    for (const job of jobs) {
      const key = jobDateKey(job);
      const arr = map.get(key) ?? [];
      arr.push(job);
      map.set(key, arr);
    }
    return map;
  }, [jobs]);

  // Month grid: Monday-first weeks, padded with nulls for alignment
  const cells = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const startOffset = (first.getDay() + 6) % 7; // 0 = Monday
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const result: (Date | null)[] = [];
    for (let i = 0; i < startOffset; i++) result.push(null);
    for (let d = 1; d <= daysInMonth; d++) result.push(new Date(year, month, d));
    while (result.length % 7 !== 0) result.push(null);
    return result;
  }, [cursor]);

  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  function handleDayClick(day: Date, dayJobs: RawScanJob[]) {
    if (dayJobs.length > 0) {
      setSelectedDay(day);
    } else if (day >= today) {
      setScanDialogDate(day);
    }
  }

  async function handleCancel(jobId: string) {
    setCancellingId(jobId);
    try {
      await scanApi.cancel(jobId);
      showSnackbar({ message: "Scan planifié annulé.", severity: "info", duration: 4000 });
      await reload();
    } catch (err) {
      showSnackbar({
        message: err instanceof ApiError ? err.detail : "Erreur réseau — impossible d'annuler.",
        severity: "error",
        duration: 6000,
      });
    } finally {
      setCancellingId(null);
    }
  }

  if (isLoading || !user || !isAdmin) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  const monthLabel = cursor.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  const selectedKey = selectedDay ? dateKey(selectedDay) : null;
  const selectedJobs = selectedKey ? (jobsByDay.get(selectedKey) ?? []) : [];

  return (
    <Box sx={{ px: { xs: 2, sm: 3, md: 4 }, pt: { xs: 2, md: 3 }, pb: 6, maxWidth: 960, mx: "auto" }}>
      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 3 }}>
        <CalendarMonthRoundedIcon sx={{ color: "text.secondary", fontSize: 28 }} />
        <Box>
          <Typography variant="headlineMedium" component="h1">
            Calendrier
          </Typography>
          <Typography variant="bodyMedium" color="text.secondary">
            Scans planifiés, en cours et terminés — cliquez un jour futur vide pour planifier un scan
          </Typography>
        </Box>
      </Box>

      <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}>
        {/* Month nav */}
        <Box sx={{ display: "flex", alignItems: "center", px: 2.5, py: 2, bgcolor: "action.hover" }}>
          <IconButton size="small" onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}>
            <ChevronLeftRoundedIcon />
          </IconButton>
          <Typography variant="titleMedium" sx={{ fontWeight: 700, flex: 1, textAlign: "center", textTransform: "capitalize" }}>
            {monthLabel}
          </Typography>
          <IconButton size="small" onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}>
            <ChevronRightRoundedIcon />
          </IconButton>
        </Box>

        <Divider />

        {loadingJobs ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <Box sx={{ p: 2.5 }}>
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, mb: 1 }}>
              {WEEKDAYS.map((w) => (
                <Typography key={w} variant="labelSmall" color="text.secondary" sx={{ textAlign: "center", fontWeight: 700 }}>
                  {w}
                </Typography>
              ))}
            </Box>
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1 }}>
              {cells.map((day, i) => {
                if (!day) return <Box key={`pad-${i}`} />;

                const key = dateKey(day);
                const dayJobs = jobsByDay.get(key) ?? [];
                const status = dayStatus(dayJobs);
                const isToday = key === dateKey(today);
                const isPast = day < today;
                const clickable = dayJobs.length > 0 || !isPast;
                const dotColor = STATUS_DOT_COLOR[status];

                return (
                  <Box
                    key={key}
                    role={clickable ? "button" : undefined}
                    tabIndex={clickable ? 0 : undefined}
                    aria-label={day.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}
                    onClick={clickable ? () => handleDayClick(day, dayJobs) : undefined}
                    onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleDayClick(day, dayJobs); } } : undefined}
                    sx={{
                      aspectRatio: "1",
                      borderRadius: 2,
                      border: 1,
                      borderColor: isToday ? "secondary.main" : "divider",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 0.5,
                      cursor: clickable ? "pointer" : "default",
                      opacity: isPast && dayJobs.length === 0 ? 0.4 : 1,
                      transition: "background-color 0.15s",
                      "&:hover": clickable ? { bgcolor: "action.hover" } : undefined,
                    }}
                  >
                    <Typography variant="bodySmall" sx={{ fontWeight: isToday ? 800 : 500 }}>
                      {day.getDate()}
                    </Typography>
                    {dotColor && (
                      <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: dotColor }} />
                    )}
                  </Box>
                );
              })}
            </Box>
          </Box>
        )}
      </Paper>

      {/* Legend */}
      <Box sx={{ display: "flex", gap: 2.5, mt: 2, flexWrap: "wrap" }}>
        {([
          ["info.main", "Planifié / en attente"],
          ["success.main", "Terminé"],
          ["error.main", "Échoué"],
        ] as const).map(([color, label]) => (
          <Box key={label} sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: color }} />
            <Typography variant="bodySmall" color="text.secondary">{label}</Typography>
          </Box>
        ))}
      </Box>

      {/* Day detail dialog */}
      <Dialog
        open={!!selectedDay}
        onClose={() => setSelectedDay(null)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 3, py: 2, borderBottom: 1, borderColor: "divider" }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="titleLarge" sx={{ fontWeight: 700 }}>
              {selectedDay?.toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
            </Typography>
          </Box>
          <IconButton onClick={() => setSelectedDay(null)} size="small">
            <CloseRoundedIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ px: 3, py: 2.5, display: "flex", flexDirection: "column", gap: 1.5 }}>
          {selectedJobs.length === 0 ? (
            <Typography variant="bodyMedium" color="text.secondary">Aucun scan ce jour-là.</Typography>
          ) : (
            selectedJobs.map((job) => (
              <Paper key={job.id} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5 }}>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="bodyMedium" sx={{ fontWeight: 700 }}>
                      {PARTNER_TYPE_LABELS[job.type_partenaire as PartnerType] ?? job.type_partenaire}
                    </Typography>
                    <Typography variant="bodySmall" color="text.secondary">
                      {job.ville}, {job.pays} · limite {job.limite}
                    </Typography>
                    {job.scheduled_at && (
                      <Typography variant="labelSmall" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                        Prévu à {new Date(job.scheduled_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                      </Typography>
                    )}
                    {job.statut === "done" && (
                      <Box sx={{ display: "flex", gap: 0.75, mt: 1, flexWrap: "wrap" }}>
                        <Chip label={`${job.nb_trouves} trouvés`} size="small" variant="outlined" sx={{ fontSize: "0.625rem", height: 20 }} />
                        <Chip label={`${job.nb_ajoutes} ajoutés`} size="small" color="success" sx={{ fontSize: "0.625rem", height: 20 }} />
                        <Chip label={`${job.nb_veille} en veille`} size="small" color="warning" variant="outlined" sx={{ fontSize: "0.625rem", height: 20 }} />
                      </Box>
                    )}
                    {job.statut === "error" && job.erreur && (
                      <Typography variant="bodySmall" color="error.main" sx={{ mt: 0.5, display: "block" }}>
                        {job.erreur}
                      </Typography>
                    )}
                  </Box>
                  <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1 }}>
                    <Chip
                      label={STATUS_LABEL[job.statut] ?? job.statut}
                      size="small"
                      color={STATUS_COLOR[job.statut] ?? "default"}
                      variant={job.statut === "done" || job.statut === "error" ? "filled" : "outlined"}
                      sx={{ fontWeight: 700, fontSize: "0.6875rem" }}
                    />
                    {job.statut === "scheduled" && (
                      <Button
                        size="small"
                        color="error"
                        onClick={() => handleCancel(job.id)}
                        disabled={cancellingId === job.id}
                      >
                        {cancellingId === job.id ? "Annulation…" : "Annuler"}
                      </Button>
                    )}
                  </Box>
                </Box>
              </Paper>
            ))
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, borderTop: 1, borderColor: "divider" }}>
          <Button onClick={() => setSelectedDay(null)}>Fermer</Button>
        </DialogActions>
      </Dialog>

      {/* Scan form anchored to the clicked date */}
      {scanDialogDate && (
        <ScanProspectDialog
          open={!!scanDialogDate}
          onClose={() => setScanDialogDate(null)}
          onBack={() => setScanDialogDate(null)}
          onScanComplete={reload}
          targetDate={scanDialogDate}
        />
      )}
    </Box>
  );
}
