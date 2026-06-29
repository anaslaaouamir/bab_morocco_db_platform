"use client";

import React, { useState, useEffect, useRef } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import Checkbox from "@mui/material/Checkbox";
import ListItemText from "@mui/material/ListItemText";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import IconButton from "@mui/material/IconButton";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import FormHelperText from "@mui/material/FormHelperText";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Slider from "@mui/material/Slider";
import Alert from "@mui/material/Alert";
import LinearProgress from "@mui/material/LinearProgress";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import { alpha, useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import TravelExploreRoundedIcon from "@mui/icons-material/TravelExploreRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";

import type { PartnerType } from "@/types/prospect";
import { PARTNER_TYPE_LABELS } from "@/types/prospect";
import { scanApi, ApiError, type RawScanJob } from "@/lib/api";
import { COUNTRIES_BY_MARKET, CITIES_BY_COUNTRY } from "@/lib/constants/geography";
import { useSnackbar } from "@/contexts/SnackbarContext";

// ─── Config maps ──────────────────────────────────────────────────────────────

const TYPE_QUERY: Record<PartnerType, string> = {
  hotel_riad:             "hôtels riads",
  hotel_luxe:             "hôtels luxe 5 étoiles",
  tour_operateur:         "tour-opérateurs agences voyages",
  agence_voyage:          "agences de voyages B2B",
  prestataire_activites:  "activités touristiques excursions",
  transport:              "transferts transport touristique",
  to_golfe:               "tour opérateurs voyages Maroc",
  mice:                   "agences MICE incentive événementiel",
};

// ─── Step label derived from job progression ──────────────────────────────────

function stepLabel(job: RawScanJob): string {
  if (job.statut === "done")  return "Scan terminé ✓";
  if (job.statut === "error") return `Erreur : ${job.erreur ?? "inconnue"}`;
  const p = job.progression;
  if (p < 10) return "Connexion Google Maps API…";
  if (p < 30) return "Recherche en cours…";
  if (p < 50) return "Récupération des résultats…";
  if (p < 70) return "Enrichissement des données (site web, OTAs)…";
  if (p < 85) return "Calcul du scoring IA…";
  return "Dédoublonnage et insertion…";
}

// ─── Form types ───────────────────────────────────────────────────────────────

interface ScanForm {
  pays: string;
  ville: string;
  types: PartnerType[];
  // Backend caps at 100; slider max matches
  limite: number;
}

const INITIAL: ScanForm = { pays: "", ville: "", types: [], limite: 50 };

interface FormErrors { pays?: string; ville?: string; types?: string; }

function validate(v: ScanForm): FormErrors {
  const e: FormErrors = {};
  if (!v.pays)              e.pays  = "Le pays est requis.";
  if (!v.ville.trim())      e.ville = "La ville est requise.";
  if (v.types.length === 0) e.types = "Sélectionnez au moins un type de partenaire.";
  return e;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ScanProspectDialogProps {
  open: boolean;
  onClose: () => void;
  onBack: () => void;
  onScanComplete?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ScanProspectDialog({ open, onClose, onBack, onScanComplete }: ScanProspectDialogProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const { showSnackbar } = useSnackbar();

  const [form, setForm]           = useState<ScanForm>(INITIAL);
  const [errors, setErrors]       = useState<FormErrors>({});
  const [attempted, setAttempted] = useState(false);

  // Scan lifecycle
  const [submitting, setSubmitting] = useState(false); // "Lancer" button spinner
  const [scanning, setScanning]     = useState(false); // scan in-progress panel visible
  const [job, setJob]               = useState<RawScanJob | null>(null);
  const [done, setDone]             = useState(false);
  const [scanError, setScanError]   = useState<string | null>(null);

  // Multi-type job queue state
  const [typeQueue, setTypeQueue]           = useState<PartnerType[]>([]);
  const [typeQueueIndex, setTypeQueueIndex] = useState(0);
  const [accumulated, setAccumulated]       = useState({ nb_ajoutes: 0, nb_veille: 0, nb_doublons: 0, nb_trouves: 0 });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopPolling() {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  // Reset everything when dialog opens
  useEffect(() => {
    if (open) {
      setForm(INITIAL);
      setErrors({});
      setAttempted(false);
      setSubmitting(false);
      setScanning(false);
      setJob(null);
      setDone(false);
      setScanError(null);
      setTypeQueue([]);
      setTypeQueueIndex(0);
      setAccumulated({ nb_ajoutes: 0, nb_veille: 0, nb_doublons: 0, nb_trouves: 0 });
      stopPolling();
    }
    return stopPolling; // cleanup on unmount
  }, [open]);

  // Polling: start when we have a jobId and are not yet done
  useEffect(() => {
    if (!job?.id || done) return;

    intervalRef.current = setInterval(async () => {
      try {
        const updated = await scanApi.status(job.id);
        setJob(updated);

        if (updated.statut === "done") {
          stopPolling();

          // Accumulate this job's results
          const newAccumulated = {
            nb_ajoutes:  accumulated.nb_ajoutes  + updated.nb_ajoutes,
            nb_veille:   accumulated.nb_veille   + updated.nb_veille,
            nb_doublons: accumulated.nb_doublons + updated.nb_doublons,
            nb_trouves:  accumulated.nb_trouves  + updated.nb_trouves,
          };
          setAccumulated(newAccumulated);

          const nextIndex = typeQueueIndex + 1;

          if (nextIndex < typeQueue.length) {
            // More types to scan — launch next job
            setTypeQueueIndex(nextIndex);
            try {
              const nextJob = await scanApi.start({
                ville:          form.ville,
                pays:           form.pays,
                typePartenaire: typeQueue[nextIndex],
                limite:         form.limite,
              });
              setJob(nextJob);
              // done stays false — polling useEffect re-fires on new job.id
            } catch (err) {
              const msg = err instanceof ApiError ? err.detail : "Erreur réseau lors du lancement du scan suivant.";
              setScanError(msg);
              setDone(true);
              showSnackbar({ message: msg, severity: "error", duration: 8000 });
            }
          } else {
            // All types scanned — truly done
            setDone(true);
            onScanComplete?.();
            showSnackbar({
              message: `Scan terminé — ${newAccumulated.nb_ajoutes} prospect(s) ajouté(s) au pipeline.`,
              severity: "success",
              duration: 6000,
            });
          }
        } else if (updated.statut === "error") {
          stopPolling();
          setDone(true);
          setScanError(updated.erreur ?? "Erreur inconnue lors du scan.");
          showSnackbar({
            message: `Erreur scan : ${updated.erreur ?? "inconnue"}`,
            severity: "error",
            duration: 8000,
          });
        }
      } catch (err) {
        stopPolling();
        const msg =
          err instanceof ApiError ? err.detail : "Erreur réseau lors du suivi du scan.";
        setScanError(msg);
        setDone(true);
        showSnackbar({ message: msg, severity: "error", duration: 8000 });
      }
    }, 2000);

    return stopPolling;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id, done]);

  function set<K extends keyof ScanForm>(key: K, value: ScanForm[K]) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "pays") next.ville = "";
      return next;
    });
    if (attempted) setErrors((prev) => { const e = { ...prev }; delete e[key as keyof FormErrors]; return e; });
  }

  async function handleLaunch() {
    setAttempted(true);
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    try {
      // Initialize queue and start the first job
      setTypeQueue(form.types);
      setTypeQueueIndex(0);
      setAccumulated({ nb_ajoutes: 0, nb_veille: 0, nb_doublons: 0, nb_trouves: 0 });

      const started = await scanApi.start({
        ville:          form.ville,
        pays:           form.pays,
        typePartenaire: form.types[0],
        limite:         form.limite,
      });
      setJob(started);
      setScanning(true);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.detail
          : "Erreur réseau — impossible de lancer le scan.";
      showSnackbar({ message: msg, severity: "error", duration: 6000 });
    } finally {
      setSubmitting(false);
    }
  }

  const progress = job ? job.progression : 0;
  const isRunning = scanning && !done;
  const isMultiJob = typeQueue.length > 1;

  const queryPreview =
    form.types.length > 0 && form.ville && form.pays
      ? form.types.map((t) => `"${TYPE_QUERY[t]} ${form.ville} ${form.pays}"`).join(" + ")
      : null;

  return (
    <Dialog
      open={open}
      onClose={isRunning ? undefined : onClose}
      fullScreen={isMobile}
      maxWidth="sm"
      fullWidth
      scroll="paper"
      PaperProps={{ sx: { borderRadius: isMobile ? 0 : 3, maxHeight: isMobile ? "100%" : "90dvh" } }}
    >
      {/* Title */}
      <DialogTitle
        sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 3, py: 2, borderBottom: 1, borderColor: "divider" }}
      >
        <IconButton size="small" onClick={onBack} disabled={isRunning}>
          <ArrowBackRoundedIcon fontSize="small" />
        </IconButton>
        <Box
          sx={{
            width: 36, height: 36, borderRadius: "50%",
            bgcolor: alpha(theme.palette.secondary.main, 0.12),
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}
        >
          <TravelExploreRoundedIcon sx={{ color: "secondary.main", fontSize: 20 }} />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="titleLarge" sx={{ fontWeight: 700 }}>
            Scan automatique
          </Typography>
          <Typography variant="bodySmall" color="text.secondary">
            Alimenté par Google Maps API + Agent IA
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small" disabled={isRunning}>
          <CloseRoundedIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      {/* Body */}
      <DialogContent sx={{ px: { xs: 2.5, md: 4 }, py: 3, display: "flex", flexDirection: "column", gap: 3 }}>

        {!scanning ? (
          <>
            {/* ── Paramètres de scan ──────────────────────────────────── */}
            <Box>
              <Typography variant="titleSmall" sx={{ fontWeight: 700, color: "secondary.main", mb: 2, display: "block" }}>
                ① Cible géographique
              </Typography>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <FormControl size="small" error={!!errors.pays} fullWidth>
                  <InputLabel>Pays *</InputLabel>
                  <Select value={form.pays} label="Pays *" onChange={(e) => set("pays", e.target.value)}>
                    {COUNTRIES_BY_MARKET.map(({ group, countries }) => [
                      <MenuItem key={`g-${group}`} disabled sx={{ fontWeight: 700, fontSize: "0.75rem", opacity: 0.6 }}>
                        {group}
                      </MenuItem>,
                      ...countries.map((c) => (
                        <MenuItem key={c} value={c} sx={{ pl: 3 }}>{c}</MenuItem>
                      )),
                    ])}
                  </Select>
                  {errors.pays && <FormHelperText>{errors.pays}</FormHelperText>}
                </FormControl>

                <Autocomplete
                  freeSolo
                  options={CITIES_BY_COUNTRY[form.pays] ?? []}
                  value={form.ville}
                  onInputChange={(_, newValue) => set("ville", newValue)}
                  disabled={!form.pays}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Ville *"
                      size="small"
                      error={!!errors.ville}
                      helperText={errors.ville ?? (!form.pays ? "Sélectionnez un pays d'abord." : undefined)}
                      placeholder="Ex : Marrakech"
                    />
                  )}
                />
              </Box>
            </Box>

            <Divider />

            {/* ── Type de partenaire ──────────────────────────────────── */}
            <Box>
              <Typography variant="titleSmall" sx={{ fontWeight: 700, color: "secondary.main", mb: 2, display: "block" }}>
                ② Type(s) de partenaire
              </Typography>
              <Autocomplete
                multiple
                disableCloseOnSelect
                options={Object.keys(PARTNER_TYPE_LABELS) as PartnerType[]}
                value={form.types}
                onChange={(_, newValue) => set("types", newValue)}
                getOptionLabel={(t) => PARTNER_TYPE_LABELS[t]}
                renderOption={(props, option, { selected }) => (
                  <li {...props}>
                    <Checkbox size="small" checked={selected} sx={{ mr: 0.5, p: 0.5 }} />
                    <ListItemText primary={PARTNER_TYPE_LABELS[option]} primaryTypographyProps={{ fontSize: "0.875rem" }} />
                  </li>
                )}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Type(s) *"
                    size="small"
                    error={!!errors.types}
                    helperText={errors.types ?? "Vous pouvez sélectionner plusieurs types — un scan sera lancé pour chacun."}
                  />
                )}
                renderTags={(selected, getTagProps) =>
                  selected.map((t, i) => (
                    <Chip
                      {...getTagProps({ index: i })}
                      key={t}
                      label={PARTNER_TYPE_LABELS[t]}
                      size="small"
                      sx={{ fontSize: "0.625rem", height: 20, "& .MuiChip-label": { px: 0.75 } }}
                    />
                  ))
                }
              />

              {queryPreview && (
                <Alert severity="info" sx={{ mt: 1.5, "& .MuiAlert-message": { fontSize: "0.8125rem" } }}>
                  Requête{form.types.length > 1 ? "s" : ""} Google Maps : <strong>{queryPreview}</strong>
                </Alert>
              )}
            </Box>

            <Divider />

            {/* ── Limite ─────────────────────────────────────────────── */}
            <Box>
              <Typography variant="titleSmall" sx={{ fontWeight: 700, color: "secondary.main", mb: 2, display: "block" }}>
                ③ Nombre de prospects à scanner
              </Typography>
              <Box sx={{ px: 1 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
                  <Typography variant="bodySmall" color="text.secondary">Limite</Typography>
                  <Typography variant="titleSmall" sx={{ fontWeight: 800, color: "secondary.main" }}>
                    {form.limite} prospects
                  </Typography>
                </Box>
                <Slider
                  value={form.limite}
                  min={10} max={100} step={10}
                  color="secondary"
                  valueLabelDisplay="auto"
                  marks={[
                    { value: 10,  label: "10"  },
                    { value: 50,  label: "50"  },
                    { value: 100, label: "100" },
                  ]}
                  onChange={(_, v) => set("limite", v as number)}
                  sx={{ "& .MuiSlider-markLabel": { fontSize: "0.625rem" } }}
                />
                <Typography variant="bodySmall" color="text.secondary" sx={{ mt: 1 }}>
                  Seuls les prospects avec un score ≥ 75 seront ajoutés au pipeline. Les autres seront mis en veille.
                </Typography>
              </Box>
            </Box>
          </>
        ) : (
          /* ── Scan in progress / done ──────────────────────────────── */
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5, py: 1 }}>
            {/* Hero icon + title */}
            <Box sx={{ textAlign: "center", py: 2 }}>
              {scanError ? (
                <ErrorOutlineRoundedIcon sx={{ fontSize: 52, color: "error.main", mb: 1 }} />
              ) : done ? (
                <CheckCircleRoundedIcon sx={{ fontSize: 52, color: "success.main", mb: 1 }} />
              ) : (
                <TravelExploreRoundedIcon
                  sx={{
                    fontSize: 52, color: "secondary.main", mb: 1,
                    animation: "spin 2s linear infinite",
                    "@keyframes spin": { from: { transform: "rotate(0deg)" }, to: { transform: "rotate(360deg)" } },
                  }}
                />
              )}
              <Typography variant="titleMedium" sx={{ fontWeight: 700 }}>
                {scanError ? "Scan échoué" : done ? "Scan terminé !" : "Scan en cours…"}
              </Typography>
              <Typography variant="bodySmall" color="text.secondary">
                {form.ville}, {form.pays} · {form.limite} max
              </Typography>
              {isMultiJob && (
                <Typography variant="labelSmall" sx={{ mt: 0.5, color: "secondary.main", fontWeight: 700 }}>
                  Scan {typeQueueIndex + 1} / {typeQueue.length} — {PARTNER_TYPE_LABELS[typeQueue[typeQueueIndex] ?? form.types[0]]}
                </Typography>
              )}
            </Box>

            {/* Progress bar */}
            <Box>
              <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.75 }}>
                <Typography variant="labelSmall" color="text.secondary">
                  {job ? stepLabel(job) : "Initialisation…"}
                </Typography>
                <Typography variant="labelSmall" sx={{ fontWeight: 700, color: "secondary.main" }}>
                  {progress}%
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={progress}
                color={scanError ? "error" : done ? "success" : "secondary"}
                sx={{ height: 8, borderRadius: 4, "& .MuiLinearProgress-bar": { borderRadius: 4 } }}
              />
            </Box>

            {/* Result summary when done */}
            {done && !scanError && (
              <Alert severity="success">
                <Typography variant="bodySmall" sx={{ fontWeight: 700, mb: 0.5, display: "block" }}>
                  {isMultiJob ? `${typeQueue.length} scans terminés avec succès` : "Scan terminé avec succès"}
                </Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mt: 0.75 }}>
                  <Chip
                    label={`${accumulated.nb_trouves} trouvés`}
                    size="small" variant="outlined"
                    sx={{ fontSize: "0.625rem", height: 20, "& .MuiChip-label": { px: 0.75 } }}
                  />
                  <Chip
                    label={`${accumulated.nb_ajoutes} ajoutés au pipeline`}
                    size="small" color="success"
                    sx={{ fontSize: "0.625rem", height: 20, "& .MuiChip-label": { px: 0.75 } }}
                  />
                  <Chip
                    label={`${accumulated.nb_veille} mis en veille`}
                    size="small" color="warning" variant="outlined"
                    sx={{ fontSize: "0.625rem", height: 20, "& .MuiChip-label": { px: 0.75 } }}
                  />
                  {accumulated.nb_doublons > 0 && (
                    <Chip
                      label={`${accumulated.nb_doublons} doublons ignorés`}
                      size="small" variant="outlined"
                      sx={{ fontSize: "0.625rem", height: 20, "& .MuiChip-label": { px: 0.75 } }}
                    />
                  )}
                </Box>
              </Alert>
            )}

            {/* Error detail */}
            {scanError && (
              <Alert severity="error">
                {scanError}
              </Alert>
            )}

            {/* Live step log */}
            {!done && job && (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {[
                  "Connexion Google Maps API",
                  "Recherche en cours",
                  "Récupération des résultats",
                  "Enrichissement des données",
                  "Calcul du scoring IA",
                  "Dédoublonnage et insertion",
                ].map((label, i) => {
                  const thresholds = [0, 10, 30, 50, 70, 85];
                  const completed = progress > thresholds[i];
                  const active    = progress >= thresholds[i] && !completed;
                  if (progress < thresholds[i]) return null;
                  return (
                    <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      {active ? (
                        <CircularProgress size={12} color="secondary" />
                      ) : (
                        <CheckCircleRoundedIcon sx={{ fontSize: 14, color: "success.main" }} />
                      )}
                      <Typography
                        variant="bodySmall"
                        color={active ? "text.primary" : "text.secondary"}
                      >
                        {label}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
            )}
          </Box>
        )}
      </DialogContent>

      {/* Actions */}
      <DialogActions sx={{ px: { xs: 2.5, md: 4 }, py: 2, borderTop: 1, borderColor: "divider", gap: 1.5 }}>
        {!scanning ? (
          <>
            <Button onClick={onBack} variant="text" disabled={submitting}>
              Retour
            </Button>
            <Button
              onClick={handleLaunch}
              variant="contained"
              color="secondary"
              disableElevation
              disabled={submitting}
              startIcon={
                submitting
                  ? <CircularProgress size={16} color="inherit" />
                  : <TravelExploreRoundedIcon />
              }
              sx={{ minWidth: 160 }}
            >
              {submitting ? "Lancement…" : "Lancer le scan"}
            </Button>
          </>
        ) : (
          <Button
            onClick={onClose}
            variant={done ? "contained" : "outlined"}
            disabled={!done}
            disableElevation
            sx={{ minWidth: 140 }}
          >
            {done ? "Fermer" : "Scan en cours…"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
