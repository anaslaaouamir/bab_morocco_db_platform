"use client";

import React, { useState, useEffect, useRef } from "react";
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
import { useSnackbar } from "@/contexts/SnackbarContext";

// ─── Config maps ──────────────────────────────────────────────────────────────

const COUNTRIES_BY_MARKET = [
  { group: "Maroc", countries: ["Maroc"] },
  { group: "Europe francophone", countries: ["France", "Belgique", "Suisse", "Luxembourg"] },
  { group: "Europe anglophone", countries: ["Royaume-Uni", "Irlande"] },
  { group: "Europe DACH", countries: ["Allemagne", "Autriche"] },
  { group: "Europe Sud", countries: ["Espagne", "Italie", "Portugal"] },
  { group: "Golfe", countries: ["Émirats Arabes Unis", "Arabie Saoudite", "Qatar", "Koweït", "Bahreïn"] },
];

const CITIES_BY_COUNTRY: Record<string, string[]> = {
  "Maroc": ["Marrakech", "Casablanca", "Fès", "Agadir", "Tanger", "Essaouira", "Chefchaouen", "Ouarzazate", "Merzouga", "Rabat", "Meknès", "Dakhla", "Taroudant", "El Jadida", "Tétouan"],
  "France": ["Paris", "Lyon", "Marseille", "Bordeaux", "Nice", "Toulouse", "Nantes", "Strasbourg", "Lille", "Montpellier"],
  "Belgique": ["Bruxelles", "Anvers", "Gand", "Liège", "Bruges"],
  "Suisse": ["Genève", "Zürich", "Lausanne", "Berne", "Bâle"],
  "Luxembourg": ["Luxembourg"],
  "Royaume-Uni": ["Londres", "Manchester", "Édimbourg", "Birmingham", "Bristol", "Glasgow", "Liverpool"],
  "Irlande": ["Dublin", "Cork", "Galway"],
  "Allemagne": ["Berlin", "Munich", "Hambourg", "Francfort", "Cologne", "Stuttgart", "Düsseldorf"],
  "Autriche": ["Vienne", "Salzbourg", "Innsbruck", "Graz"],
  "Espagne": ["Madrid", "Barcelone", "Séville", "Valence", "Malaga", "Bilbao", "Palma de Majorque"],
  "Italie": ["Rome", "Milan", "Florence", "Venise", "Naples", "Turin", "Bologne"],
  "Portugal": ["Lisbonne", "Porto", "Faro", "Braga"],
  "Pays-Bas": ["Amsterdam", "Rotterdam", "La Haye", "Utrecht"],
  "Danemark": ["Copenhague", "Aarhus", "Odense"],
  "Suède": ["Stockholm", "Göteborg", "Malmö"],
  "Norvège": ["Oslo", "Bergen", "Stavanger"],
  "Émirats Arabes Unis": ["Dubaï", "Abu Dhabi", "Sharjah", "Ras Al Khaïmah"],
  "Arabie Saoudite": ["Riyad", "Djeddah", "La Mecque", "Médine", "Dammam"],
  "Qatar": ["Doha", "Al Wakrah", "Al Khor"],
  "Koweït": ["Koweït City", "Hawalli", "Salmiya"],
  "Bahreïn": ["Manama", "Riffa", "Muharraq"],
  "Jordanie": ["Amman", "Aqaba", "Pétra", "Jerash"],
  "États-Unis": ["New York", "Los Angeles", "Miami", "Chicago", "San Francisco", "Houston", "Boston"],
  "Canada": ["Toronto", "Montréal", "Vancouver", "Calgary", "Ottawa"],
  "Australie": ["Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide"],
  "Mexique": ["Mexico", "Cancún", "Guadalajara", "Monterrey"],
  "Argentine": ["Buenos Aires", "Mendoza", "Córdoba", "Rosario"],
  "Colombie": ["Bogotá", "Medellín", "Cartagena", "Cali"],
};

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
  type: PartnerType | "";
  // Backend caps at 100; slider max matches
  limite: number;
}

const INITIAL: ScanForm = { pays: "", ville: "", type: "", limite: 50 };

interface FormErrors { pays?: string; ville?: string; type?: string; }

function validate(v: ScanForm): FormErrors {
  const e: FormErrors = {};
  if (!v.pays)         e.pays  = "Le pays est requis.";
  if (!v.ville.trim()) e.ville = "La ville est requise.";
  if (!v.type)         e.type  = "Le type de partenaire est requis.";
  return e;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ScanProspectDialogProps {
  open: boolean;
  onClose: () => void;
  onBack: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ScanProspectDialog({ open, onClose, onBack }: ScanProspectDialogProps) {
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
          setDone(true);
          showSnackbar({
            message: `Scan terminé — ${updated.nb_ajoutes} prospect(s) ajouté(s) au pipeline.`,
            severity: "success",
            duration: 6000,
          });
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
      const started = await scanApi.start({
        ville:          form.ville,
        pays:           form.pays,
        typePartenaire: form.type as PartnerType,
        limite:         form.limite, // slider already capped at 100
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

  const suggestedCities = CITIES_BY_COUNTRY[form.pays] ?? [];
  const progress = job ? job.progression : 0;
  const isRunning = scanning && !done;

  const queryPreview =
    form.type && form.ville && form.pays
      ? `"${TYPE_QUERY[form.type as PartnerType]} ${form.ville} ${form.pays}"`
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

                {suggestedCities.length > 0 ? (
                  <FormControl size="small" error={!!errors.ville} fullWidth>
                    <InputLabel>Ville *</InputLabel>
                    <Select
                      value={form.ville}
                      label="Ville *"
                      onChange={(e) => set("ville", e.target.value)}
                      disabled={!form.pays}
                    >
                      {suggestedCities.map((c) => (
                        <MenuItem key={c} value={c}>{c}</MenuItem>
                      ))}
                    </Select>
                    {errors.ville && <FormHelperText>{errors.ville}</FormHelperText>}
                  </FormControl>
                ) : (
                  <TextField
                    label="Ville *"
                    value={form.ville}
                    onChange={(e) => set("ville", e.target.value)}
                    error={!!errors.ville}
                    helperText={errors.ville ?? (form.pays ? undefined : "Sélectionnez un pays d'abord.")}
                    size="small" fullWidth disabled={!form.pays}
                    placeholder="Ex : Marrakech"
                  />
                )}
              </Box>
            </Box>

            <Divider />

            {/* ── Type de partenaire ──────────────────────────────────── */}
            <Box>
              <Typography variant="titleSmall" sx={{ fontWeight: 700, color: "secondary.main", mb: 2, display: "block" }}>
                ② Type de partenaire
              </Typography>
              <FormControl size="small" error={!!errors.type} fullWidth>
                <InputLabel>Type *</InputLabel>
                <Select
                  value={form.type}
                  label="Type *"
                  onChange={(e) => set("type", e.target.value as PartnerType)}
                >
                  {(Object.keys(PARTNER_TYPE_LABELS) as PartnerType[]).map((t) => (
                    <MenuItem key={t} value={t}>{PARTNER_TYPE_LABELS[t]}</MenuItem>
                  ))}
                </Select>
                {errors.type && <FormHelperText>{errors.type}</FormHelperText>}
              </FormControl>

              {queryPreview && (
                <Alert severity="info" sx={{ mt: 1.5, "& .MuiAlert-message": { fontSize: "0.8125rem" } }}>
                  Requête Google Maps : <strong>{queryPreview}</strong>
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
                {form.ville}, {form.pays} · {PARTNER_TYPE_LABELS[form.type as PartnerType]} · {form.limite} max
              </Typography>
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
            {done && job && !scanError && (
              <Alert severity="success">
                <Typography variant="bodySmall" sx={{ fontWeight: 700, mb: 0.5, display: "block" }}>
                  Scan terminé avec succès
                </Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mt: 0.75 }}>
                  <Chip
                    label={`${job.nb_trouves} trouvés`}
                    size="small" variant="outlined"
                    sx={{ fontSize: "0.625rem", height: 20, "& .MuiChip-label": { px: 0.75 } }}
                  />
                  <Chip
                    label={`${job.nb_ajoutes} ajoutés au pipeline`}
                    size="small" color="success"
                    sx={{ fontSize: "0.625rem", height: 20, "& .MuiChip-label": { px: 0.75 } }}
                  />
                  <Chip
                    label={`${job.nb_veille} mis en veille`}
                    size="small" color="warning" variant="outlined"
                    sx={{ fontSize: "0.625rem", height: 20, "& .MuiChip-label": { px: 0.75 } }}
                  />
                  {job.nb_doublons > 0 && (
                    <Chip
                      label={`${job.nb_doublons} doublons ignorés`}
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
