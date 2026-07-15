"use client";

import React, { useState, useEffect, useCallback } from "react";
import Autocomplete from "@mui/material/Autocomplete";
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
import LinearProgress from "@mui/material/LinearProgress";
import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Tooltip from "@mui/material/Tooltip";
import { alpha, useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";

import type { Prospect, PartnerType, PipelineStage, OutreachLanguage, ScoreBreakdown } from "@/types/prospect";
import {
  PARTNER_TYPE_LABELS,
  STAGE_LABELS,
  LANGUAGE_FLAGS,
  scoreColor,
} from "@/types/prospect";
import { prospectsApi, ApiError } from "@/lib/api";
import type { RawScorePreviewResponse } from "@/lib/api";
import { COUNTRIES, CITIES_BY_COUNTRY } from "@/lib/constants/geography";
import { useSnackbar } from "@/contexts/SnackbarContext";

// ─── Auto-fill maps ───────────────────────────────────────────────────────

const TYPE_COMMISSION: Record<PartnerType, { standard: number; plancher: number }> = {
  hotel_riad:             { standard: 10, plancher: 8  },
  hotel_luxe:             { standard: 10, plancher: 8  },
  tour_operateur:         { standard: 12, plancher: 10 },
  agence_voyage:          { standard: 14, plancher: 12 },
  prestataire_activites:  { standard: 18, plancher: 15 },
  transport:              { standard: 15, plancher: 12 },
  to_golfe:               { standard: 12, plancher: 10 },
  mice:                   { standard: 12, plancher: 10 },
};

const PAYS_LANGUE: Record<string, OutreachLanguage> = {
  "Maroc":                  "fr",
  "France":                 "fr",
  "Belgique":               "fr",
  "Suisse":                 "fr",
  "Luxembourg":             "fr",
  "Royaume-Uni":            "en",
  "Irlande":                "en",
  "États-Unis":             "en",
  "Canada":                 "en",
  "Australie":              "en",
  "Émirats Arabes Unis":    "en",
  "Espagne":                "es",
  "Mexique":                "es",
  "Argentine":              "es",
  "Colombie":               "es",
  "Allemagne":              "de",
  "Autriche":               "de",
  "Arabie Saoudite":        "ar",
  "Qatar":                  "ar",
  "Koweït":                 "ar",
  "Bahreïn":                "ar",
  "Jordanie":               "ar",
};


const PIPELINE_STAGES: PipelineStage[] = [
  "prospection", "qualification", "outreach",
  "negociation", "closing", "activation_ota", "veille",
];

const SCORE_CRITERIA: { key: keyof ScoreBreakdown; label: string; max: number; hint: string }[] = [
  { key: "activiteDigitale",  label: "Activité digitale",  max: 25, hint: "Présence web, avis OTA, réseaux sociaux" },
  { key: "coherenceMarche",   label: "Cohérence marché",   max: 25, hint: "Clientèle alignée Europe / Golfe" },
  { key: "tailleCapacite",    label: "Taille & capacité",  max: 20, hint: "Nombre de chambres / activités, volume potentiel" },
  { key: "contactDecideur",   label: "Contact décideur",   max: 15, hint: "Email direct ou LinkedIn DG / responsable commercial" },
  { key: "liberteOta",        label: "Liberté OTA",        max: 15, hint: "Absence de partenariat exclusif avec un concurrent" },
];

// ─── Form types ───────────────────────────────────────────────────────────

interface FormValues {
  nom:                  string;
  type:                 PartnerType | "";
  pays:                 string;
  ville:                string;
  region:               string;
  adresseWeb:           string;
  nomContact:           string;
  posteContact:         string;
  emailContact:         string;
  linkedinContact:      string;
  telephone:            string;
  noteGoogle:           string;
  nbAvisGoogle:         string;
  languesDisponibles:   string;
  nbChambres:           string;
  capaciteDescription:  string;
  stage:                PipelineStage;
  commissionStandard:   string;
  commissionPlancher:   string;
  langue:               OutreachLanguage;
  notes:                string;
}

const INITIAL_FORM: FormValues = {
  nom:                  "",
  type:                 "",
  pays:                 "",
  ville:                "",
  region:               "",
  adresseWeb:           "",
  nomContact:           "",
  posteContact:         "",
  emailContact:         "",
  linkedinContact:      "",
  telephone:            "",
  noteGoogle:           "",
  nbAvisGoogle:         "",
  languesDisponibles:   "",
  nbChambres:           "",
  capaciteDescription:  "",
  stage:                "prospection",
  commissionStandard:   "",
  commissionPlancher:   "",
  langue:               "fr",
  notes: "",
};

// Maps the backend's snake_case score-preview response to the camelCase
// ScoreBreakdown shape the existing <ScorePreview> display component expects.
function previewToBreakdown(r: RawScorePreviewResponse): ScoreBreakdown {
  return {
    activiteDigitale: r.score_activite_digitale,
    coherenceMarche:  r.score_coherence_marche,
    tailleCapacite:   r.score_taille_capacite,
    contactDecideur:  r.score_contact_decideur,
    liberteOta:       r.score_liberte_ota,
  };
}

// ─── Validation ───────────────────────────────────────────────────────────

type FormErrors = Partial<Record<keyof FormValues, string>>;

function validate(v: FormValues): FormErrors {
  const errs: FormErrors = {};
  if (!v.nom.trim())          errs.nom          = "Le nom est requis.";
  if (!v.type)                errs.type         = "Le type de partenaire est requis.";
  if (!v.pays)                errs.pays         = "Le pays est requis.";
  if (!v.ville.trim())        errs.ville        = "La ville est requise.";
  if (!v.nomContact.trim())   errs.nomContact   = "Le nom du contact est requis.";
  if (!v.posteContact.trim()) errs.posteContact = "Le poste est requis.";
  if (!v.emailContact.trim()) {
    errs.emailContact = "L'email est requis.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.emailContact)) {
    errs.emailContact = "Format d'email invalide.";
  }
  return errs;
}

// ─── Sub-components ───────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      variant="titleSmall"
      sx={{ fontWeight: 700, color: "primary.main", mb: 2, mt: 0.5, display: "block" }}
    >
      {children}
    </Typography>
  );
}

function Field2Col({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
      {children}
    </Box>
  );
}

// ─── Score preview panel ──────────────────────────────────────────────────

function ScorePreview({ score }: { score: ScoreBreakdown }) {
  const theme = useTheme();
  const total = score.activiteDigitale + score.coherenceMarche +
                score.tailleCapacite  + score.contactDecideur  + score.liberteOta;
  const color = scoreColor(total);
  const muiColor = theme.palette[color].main;

  const label =
    total >= 85 ? "Prospect premium — priorité outreach"
    : total >= 75 ? "Éligible outreach ✓"
    : "Sous le seuil — mise en veille automatique";

  return (
    <Box
      sx={{
        p: 2,
        borderRadius: 2,
        bgcolor: alpha(muiColor, 0.06),
        border: `1.5px solid ${alpha(muiColor, 0.25)}`,
        mb: 2.5,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          {total >= 75 ? (
            <CheckCircleRoundedIcon sx={{ color: muiColor, fontSize: 20 }} />
          ) : (
            <WarningAmberRoundedIcon sx={{ color: muiColor, fontSize: 20 }} />
          )}
          <Typography variant="titleSmall" sx={{ fontWeight: 700, color: muiColor }}>
            {label}
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.5 }}>
          <Typography sx={{ fontSize: "1.75rem", fontWeight: 800, lineHeight: 1, color: muiColor }}>
            {total}
          </Typography>
          <Typography variant="bodySmall" color="text.secondary">/100</Typography>
        </Box>
      </Box>

      <LinearProgress
        variant="determinate"
        value={total}
        sx={{
          height: 8, borderRadius: 4,
          bgcolor: alpha(muiColor, 0.15),
          "& .MuiLinearProgress-bar": { bgcolor: muiColor, borderRadius: 4 },
        }}
      />

      <Box sx={{ position: "relative", height: 16, mt: 0.25 }}>
        {[75, 85].map((threshold) => (
          <Box
            key={threshold}
            sx={{
              position: "absolute",
              left: `${threshold}%`,
              transform: "translateX(-50%)",
              display: "flex", flexDirection: "column", alignItems: "center",
            }}
          >
            <Box sx={{ width: 1, height: 6, bgcolor: "text.disabled" }} />
            <Typography variant="labelSmall" color="text.disabled" sx={{ fontSize: "0.5625rem" }}>
              {threshold}
            </Typography>
          </Box>
        ))}
      </Box>

      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mt: 1.25 }}>
        {SCORE_CRITERIA.map(({ key, label: cLabel, max }) => {
          const val = score[key];
          const pct = (val / max) * 100;
          const chipColor = pct >= 80 ? "success" : pct >= 50 ? "warning" : "default";
          return (
            <Chip
              key={key}
              label={`${cLabel} ${val}/${max}`}
              color={chipColor}
              size="small"
              variant="outlined"
              sx={{ fontSize: "0.625rem", height: 20, "& .MuiChip-label": { px: 0.75 } }}
            />
          );
        })}
      </Box>
    </Box>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────

export interface AddProspectDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (prospect: Prospect) => void;
}

// ─── Main component ───────────────────────────────────────────────────────

export default function AddProspectDialog({ open, onClose, onAdd }: AddProspectDialogProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const { showSnackbar } = useSnackbar();

  const [values, setValues]       = useState<FormValues>(INITIAL_FORM);
  const [errors, setErrors]       = useState<FormErrors>({});
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Live score preview — computed by the real scoring engine (backend
  // recomputes on submit regardless, so this must reflect the same formula
  // rather than letting a Commercial hand-set a number the server ignores).
  const [preview, setPreview] = useState<ScoreBreakdown | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setValues(INITIAL_FORM);
      setErrors({});
      setAttempted(false);
      setSubmitting(false);
      setPreview(null);
      setPreviewLoading(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setPreviewLoading(true);
    const timer = setTimeout(async () => {
      try {
        const resp = await prospectsApi.scorePreview({
          adresseWeb:          values.adresseWeb.trim() || undefined,
          pays:                values.pays || undefined,
          emailContact:        values.emailContact.trim() || undefined,
          linkedinContact:     values.linkedinContact.trim() || undefined,
          nbChambres:          values.nbChambres ? Number(values.nbChambres) : undefined,
          capaciteDescription: values.capaciteDescription.trim() || undefined,
          noteGoogle:          values.noteGoogle ? Number(values.noteGoogle) : undefined,
          nbAvisGoogle:        values.nbAvisGoogle ? Number(values.nbAvisGoogle) : undefined,
          telephone:           values.telephone.trim() || undefined,
          languesDisponibles:  values.languesDisponibles.trim() || undefined,
        });
        setPreview(previewToBreakdown(resp));
      } catch {
        // Live preview is best-effort — a failed call just leaves the last
        // known preview in place rather than blocking the form.
      } finally {
        setPreviewLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    values.adresseWeb, values.pays, values.emailContact, values.linkedinContact,
    values.nbChambres, values.capaciteDescription,
    values.noteGoogle, values.nbAvisGoogle, values.telephone, values.languesDisponibles,
  ]);

  const set = useCallback(<K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "type" && value) {
        const comm = TYPE_COMMISSION[value as PartnerType];
        next.commissionStandard = String(comm.standard);
        next.commissionPlancher = String(comm.plancher);
      }
      if (key === "pays" && value) {
        const suggestedLangue = PAYS_LANGUE[value as string];
        if (suggestedLangue) next.langue = suggestedLangue;
      }
      return next;
    });
    if (attempted) {
      setErrors((prev) => { const e = { ...prev }; delete e[key]; return e; });
    }
  }, [attempted]);

  async function handleSubmit() {
    setAttempted(true);
    const errs = validate(values);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    try {
      const created = await prospectsApi.create({
        nom:                values.nom.trim(),
        type:               values.type as PartnerType,
        pays:               values.pays,
        ville:              values.ville.trim(),
        region:             values.region.trim() || undefined,
        adresseWeb:         values.adresseWeb.trim(),
        emailContact:       values.emailContact.trim(),
        linkedinContact:    values.linkedinContact.trim() || undefined,
        nomContact:         values.nomContact.trim(),
        posteContact:       values.posteContact.trim(),
        nbChambres:         values.nbChambres ? Number(values.nbChambres) : undefined,
        capaciteDescription:values.capaciteDescription.trim() || undefined,
        telephone:          values.telephone.trim() || undefined,
        noteGoogle:         values.noteGoogle ? Number(values.noteGoogle) : undefined,
        nbAvisGoogle:       values.nbAvisGoogle ? Number(values.nbAvisGoogle) : undefined,
        languesDisponibles: values.languesDisponibles.trim() || undefined,
        stage:              values.stage,
        commissionStandard: Number(values.commissionStandard) || TYPE_COMMISSION[values.type as PartnerType].standard,
        commissionPlancher: Number(values.commissionPlancher) || TYPE_COMMISSION[values.type as PartnerType].plancher,
        langue:             values.langue,
        presenceBooking:    false,
        presenceExpedia:    false,
        dateAjout:          new Date().toISOString().split("T")[0],
        notes:              values.notes.trim() || undefined,
      });
      onAdd(created);
      onClose();
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.detail
          : "Erreur réseau — impossible d'ajouter le prospect.";
      showSnackbar({ message: msg, severity: "error", duration: 6000 });
    } finally {
      setSubmitting(false);
    }
  }

  const scoreTotal = preview
    ? preview.activiteDigitale + preview.coherenceMarche +
      preview.tailleCapacite  + preview.contactDecideur  +
      preview.liberteOta
    : 0;

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : onClose}
      fullScreen={isMobile}
      maxWidth="md"
      fullWidth
      scroll="paper"
      PaperProps={{
        sx: { borderRadius: isMobile ? 0 : 3, maxHeight: isMobile ? "100%" : "92dvh" },
      }}
    >
      {/* ── Title bar ─────────────────────────────────────────── */}
      <DialogTitle
        sx={{
          display: "flex", alignItems: "center", gap: 1.5,
          px: 3, py: 2, borderBottom: 1, borderColor: "divider",
        }}
      >
        <Box
          sx={{
            width: 36, height: 36, borderRadius: "50%",
            bgcolor: alpha(theme.palette.primary.main, 0.12),
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}
        >
          <AddRoundedIcon sx={{ color: "primary.main", fontSize: 20 }} />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="titleLarge" sx={{ fontWeight: 700 }}>
            Nouveau prospect
          </Typography>
          <Typography variant="bodySmall" color="text.secondary">
            Les champs marqués * sont obligatoires.
          </Typography>
        </Box>

        {scoreTotal > 0 && (
          <Chip
            label={`Score ${scoreTotal}/100`}
            color={scoreColor(scoreTotal)}
            size="small"
            sx={{ fontWeight: 700 }}
          />
        )}

        <IconButton onClick={onClose} size="small" aria-label="Fermer" disabled={submitting}>
          <CloseRoundedIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      {/* ── Scrollable body ────────────────────────────────────── */}
      <DialogContent
        dividers={false}
        sx={{ px: { xs: 2.5, md: 4 }, py: 3, display: "flex", flexDirection: "column", gap: 3.5 }}
      >

        {/* ── 1. Identification ──────────────────────────────────── */}
        <Box>
          <SectionLabel>① Identification</SectionLabel>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>

            <TextField
              label="Nom de l'établissement *"
              value={values.nom}
              onChange={(e) => set("nom", e.target.value)}
              error={!!errors.nom}
              helperText={errors.nom}
              fullWidth size="small" autoFocus
              disabled={submitting}
            />

            <Field2Col>
              <FormControl size="small" error={!!errors.type} fullWidth>
                <InputLabel>Type de partenaire *</InputLabel>
                <Select
                  value={values.type}
                  label="Type de partenaire *"
                  onChange={(e) => set("type", e.target.value as PartnerType)}
                  disabled={submitting}
                >
                  {(Object.keys(PARTNER_TYPE_LABELS) as PartnerType[]).map((t) => (
                    <MenuItem key={t} value={t}>{PARTNER_TYPE_LABELS[t]}</MenuItem>
                  ))}
                </Select>
                {errors.type && <FormHelperText>{errors.type}</FormHelperText>}
              </FormControl>

              <FormControl size="small" error={!!errors.pays} fullWidth>
                <InputLabel>Pays *</InputLabel>
                <Select
                  value={values.pays}
                  label="Pays *"
                  onChange={(e) => set("pays", e.target.value)}
                  disabled={submitting}
                >
                  {COUNTRIES.map((c) => (
                    <MenuItem key={c} value={c}>{c}</MenuItem>
                  ))}
                </Select>
                {errors.pays && <FormHelperText>{errors.pays}</FormHelperText>}
              </FormControl>
            </Field2Col>

            <Field2Col>
              <Autocomplete
                freeSolo
                options={CITIES_BY_COUNTRY[values.pays] ?? []}
                value={values.ville}
                onInputChange={(_, newValue) => set("ville", newValue)}
                disabled={submitting}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Ville *"
                    size="small"
                    error={!!errors.ville}
                    helperText={errors.ville ?? (!values.pays ? "Sélectionnez un pays pour voir les suggestions." : undefined)}
                    placeholder="Ex : Marrakech"
                  />
                )}
              />
              <TextField
                label="Région"
                value={values.region}
                onChange={(e) => set("region", e.target.value)}
                size="small" disabled={submitting}
              />
            </Field2Col>

            <TextField
              label="Site web"
              value={values.adresseWeb}
              onChange={(e) => set("adresseWeb", e.target.value)}
              size="small" placeholder="exemple.com" fullWidth disabled={submitting}
            />

          </Box>
        </Box>

        <Divider />

        {/* ── 2. Contact décideur ────────────────────────────────── */}
        <Box>
          <SectionLabel>② Contact décideur</SectionLabel>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>

            <Field2Col>
              <TextField
                label="Nom du contact *"
                value={values.nomContact}
                onChange={(e) => set("nomContact", e.target.value)}
                error={!!errors.nomContact}
                helperText={errors.nomContact}
                size="small" disabled={submitting}
              />
              <TextField
                label="Poste *"
                value={values.posteContact}
                onChange={(e) => set("posteContact", e.target.value)}
                error={!!errors.posteContact}
                helperText={errors.posteContact}
                size="small" disabled={submitting}
              />
            </Field2Col>

            <TextField
              label="Email *"
              type="email"
              value={values.emailContact}
              onChange={(e) => set("emailContact", e.target.value)}
              error={!!errors.emailContact}
              helperText={errors.emailContact}
              size="small" fullWidth disabled={submitting}
            />

            <TextField
              label="LinkedIn (URL ou profil)"
              value={values.linkedinContact}
              onChange={(e) => set("linkedinContact", e.target.value)}
              size="small" fullWidth
              placeholder="linkedin.com/in/prenom-nom"
              disabled={submitting}
            />

            <TextField
              label="Téléphone"
              value={values.telephone}
              onChange={(e) => set("telephone", e.target.value)}
              size="small" fullWidth
              placeholder="+212 6 00 00 00 00"
              disabled={submitting}
            />

          </Box>
        </Box>

        <Divider />

        {/* ── 3. Établissement ───────────────────────────────────── */}
        <Box>
          <SectionLabel>③ Établissement</SectionLabel>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>

            <Field2Col>
              <TextField
                label="Note Google"
                type="number"
                value={values.noteGoogle}
                onChange={(e) => set("noteGoogle", e.target.value)}
                size="small"
                slotProps={{ htmlInput: { min: 0, max: 5, step: 0.1 } }}
                disabled={submitting}
              />
              <TextField
                label="Nb. avis Google"
                type="number"
                value={values.nbAvisGoogle}
                onChange={(e) => set("nbAvisGoogle", e.target.value)}
                size="small"
                slotProps={{ htmlInput: { min: 0 } }}
                disabled={submitting}
              />
            </Field2Col>

            <TextField
              label="Langues publiées"
              value={values.languesDisponibles}
              onChange={(e) => set("languesDisponibles", e.target.value)}
              size="small" fullWidth
              placeholder="Ex : fr,en,es"
              disabled={submitting}
            />

            <TextField
              label="Description de la capacité"
              value={values.capaciteDescription}
              onChange={(e) => set("capaciteDescription", e.target.value)}
              size="small"
              placeholder="Ex : 8 tentes · 24 personnes"
              disabled={submitting}
              fullWidth
            />

            <Typography variant="bodySmall" color="text.secondary" sx={{ mt: 0.5 }}>
              Informations complémentaires (optionnel)
            </Typography>

            <Field2Col>
              <TextField
                label="Nombre de chambres"
                type="number"
                value={values.nbChambres}
                onChange={(e) => set("nbChambres", e.target.value)}
                size="small"
                slotProps={{ htmlInput: { min: 0 } }}
                disabled={submitting}
              />
            </Field2Col>

          </Box>
        </Box>

        <Divider />

        {/* ── 4. Pipeline & Commission ───────────────────────────── */}
        <Box>
          <SectionLabel>④ Pipeline & commission</SectionLabel>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>

            <Field2Col>
              <FormControl size="small" fullWidth>
                <InputLabel>Étape initiale</InputLabel>
                <Select
                  value={values.stage}
                  label="Étape initiale"
                  onChange={(e) => set("stage", e.target.value as PipelineStage)}
                  disabled={submitting}
                >
                  {PIPELINE_STAGES.map((s) => (
                    <MenuItem key={s} value={s}>{STAGE_LABELS[s]}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small" fullWidth>
                <InputLabel>Langue d'outreach</InputLabel>
                <Select
                  value={values.langue}
                  label="Langue d'outreach"
                  onChange={(e) => set("langue", e.target.value as OutreachLanguage)}
                  disabled={submitting}
                  startAdornment={
                    <Typography sx={{ pl: 1, fontSize: "1rem" }}>
                      {LANGUAGE_FLAGS[values.langue]}
                    </Typography>
                  }
                >
                  {(["fr", "en", "es", "de", "ar"] as OutreachLanguage[]).map((l) => (
                    <MenuItem key={l} value={l}>
                      {LANGUAGE_FLAGS[l]} {l.toUpperCase()}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Field2Col>

            <Field2Col>
              <Box sx={{ position: "relative" }}>
                <TextField
                  label="Commission standard (%)"
                  type="number"
                  value={values.commissionStandard}
                  onChange={(e) => set("commissionStandard", e.target.value)}
                  size="small" fullWidth
                  slotProps={{ htmlInput: { min: 0, max: 30, step: 0.5 } }}
                  disabled={submitting}
                />
                {values.type && values.commissionStandard && (
                  <Tooltip title="Rempli automatiquement selon le type" placement="top">
                    <AutoAwesomeRoundedIcon
                      sx={{
                        position: "absolute", right: 36, top: "50%",
                        transform: "translateY(-50%)",
                        fontSize: 14, color: "primary.main", pointerEvents: "none",
                      }}
                    />
                  </Tooltip>
                )}
              </Box>
              <Box sx={{ position: "relative" }}>
                <TextField
                  label="Plancher absolu (%)"
                  type="number"
                  value={values.commissionPlancher}
                  onChange={(e) => set("commissionPlancher", e.target.value)}
                  size="small" fullWidth
                  slotProps={{ htmlInput: { min: 0, max: 30, step: 0.5 } }}
                  disabled={submitting}
                />
                {values.type && values.commissionPlancher && (
                  <Tooltip title="Rempli automatiquement selon le type" placement="top">
                    <AutoAwesomeRoundedIcon
                      sx={{
                        position: "absolute", right: 36, top: "50%",
                        transform: "translateY(-50%)",
                        fontSize: 14, color: "primary.main", pointerEvents: "none",
                      }}
                    />
                  </Tooltip>
                )}
              </Box>
            </Field2Col>

            {!values.type && (
              <Typography variant="bodySmall" color="text.disabled" sx={{ mt: -0.5 }}>
                Sélectionnez un type pour remplir automatiquement la commission.
              </Typography>
            )}

          </Box>
        </Box>

        <Divider />

        {/* ── 5. Score ───────────────────────────────────────────── */}
        <Box>
          <SectionLabel>
            ⑤ Aperçu du score {previewLoading && <CircularProgress size={12} sx={{ ml: 1 }} />}
          </SectionLabel>
          <Typography variant="bodySmall" color="text.secondary" sx={{ mb: 1.5, display: "block" }}>
            Calculé automatiquement par le moteur de scoring à mesure que vous remplissez le
            formulaire — le score final est toujours recalculé côté serveur.
          </Typography>
          {preview ? (
            <ScorePreview score={preview} />
          ) : (
            <Typography variant="bodySmall" color="text.disabled">
              Renseignez le pays et l&apos;email pour voir un premier aperçu.
            </Typography>
          )}
        </Box>

        <Divider />

        {/* ── 6. Notes ───────────────────────────────────────────── */}
        <Box>
          <SectionLabel>⑥ Notes internes</SectionLabel>
          <TextField
            multiline minRows={3} fullWidth size="small"
            placeholder="Observations, contexte de découverte, points d'attention…"
            value={values.notes}
            onChange={(e) => set("notes", e.target.value)}
            disabled={submitting}
            sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
          />
        </Box>

        {attempted && Object.keys(errors).length > 0 && (
          <Alert severity="error" sx={{ borderRadius: 2 }}>
            {Object.keys(errors).length} champ(s) requis manquant(s) — veuillez les corriger avant de soumettre.
          </Alert>
        )}

      </DialogContent>

      {/* ── Action bar ─────────────────────────────────────────── */}
      <DialogActions
        sx={{
          px: { xs: 2.5, md: 4 }, py: 2,
          borderTop: 1, borderColor: "divider",
          gap: 1.5,
          flexDirection: { xs: "column", sm: "row" },
          alignItems: { xs: "stretch", sm: "center" },
        }}
      >
        <Box sx={{ flex: 1 }}>
          {scoreTotal > 0 && (
            <Typography variant="bodySmall" color="text.secondary">
              Score actuel :{" "}
              <Typography
                component="span"
                variant="bodySmall"
                sx={{ fontWeight: 700, color: theme.palette[scoreColor(scoreTotal)].main }}
              >
                {scoreTotal}/100
              </Typography>{" "}
              {scoreTotal >= 75
                ? "— sera placé en file outreach"
                : "— sera mis en veille automatiquement"}
            </Typography>
          )}
        </Box>
        <Button onClick={onClose} variant="text" sx={{ minWidth: 90 }} disabled={submitting}>
          Annuler
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disableElevation
          disabled={submitting}
          startIcon={
            submitting
              ? <CircularProgress size={16} color="inherit" />
              : <AddRoundedIcon />
          }
          sx={{ minWidth: 180 }}
        >
          {submitting ? "Enregistrement…" : "Ajouter au pipeline"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
