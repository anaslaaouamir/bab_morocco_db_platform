"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import SwipeableDrawer from "@mui/material/SwipeableDrawer";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import LinearProgress from "@mui/material/LinearProgress";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Alert from "@mui/material/Alert";
import Tooltip from "@mui/material/Tooltip";
import Avatar from "@mui/material/Avatar";
import Link from "@mui/material/Link";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Button from "@mui/material/Button";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Skeleton from "@mui/material/Skeleton";
import CircularProgress from "@mui/material/CircularProgress";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import Autocomplete from "@mui/material/Autocomplete";
import { alpha, useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import LinkedInIcon from "@mui/icons-material/LinkedIn";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import BedOutlinedIcon from "@mui/icons-material/BedOutlined";
import CalendarTodayOutlinedIcon from "@mui/icons-material/CalendarTodayOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import StarRateRoundedIcon from "@mui/icons-material/StarRateRounded";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import VerifiedRoundedIcon from "@mui/icons-material/VerifiedRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import MarkEmailReadRoundedIcon from "@mui/icons-material/MarkEmailReadRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import DeleteRoundedIcon from "@mui/icons-material/DeleteRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import CancelRoundedIcon from "@mui/icons-material/CancelRounded";

import type { Prospect, PipelineStage, PartnerType, OutreachLanguage } from "@/types/prospect";
import {
  scoreTotal,
  scoreColor,
  PARTNER_TYPE_LABELS,
  STAGE_LABELS,
  LANGUAGE_FLAGS,
} from "@/types/prospect";
import { outreachApi, prospectsApi, ApiError } from "@/lib/api";
import type { RawOutreachEmail } from "@/lib/api";
import { useSnackbar } from "@/contexts/SnackbarContext";
import ConfirmationDialog from "@/components/shared/ConfirmationDialog";
import { COUNTRIES, CITIES_BY_COUNTRY } from "@/lib/constants/geography";

// ─── Constants ────────────────────────────────────────────────────────────

const DRAWER_WIDTH = 440;

const STAGE_COLORS: Record<
  PipelineStage,
  "default" | "primary" | "info" | "warning" | "secondary" | "success" | "error"
> = {
  prospection:    "default",
  qualification:  "info",
  outreach:       "warning",
  negociation:    "secondary",
  closing:        "success",
  activation_ota: "success",
  veille:         "default",
  perdu:          "error",
};

const TYPE_COLORS: Record<
  import("@/types/prospect").PartnerType,
  "default" | "primary" | "secondary" | "info" | "warning" | "success" | "error"
> = {
  hotel_riad:              "primary",
  hotel_luxe:              "warning",
  tour_operateur:          "info",
  agence_voyage:           "secondary",
  prestataire_activites:   "success",
  transport:               "default",
  to_golfe:                "warning",
  mice:                    "secondary",
};

const PIPELINE_STAGES: PipelineStage[] = [
  "prospection", "qualification", "outreach",
  "negociation", "closing", "activation_ota", "veille", "perdu",
];

const SCORE_CRITERIA: { key: keyof Prospect["score"]; label: string; max: number }[] = [
  { key: "activiteDigitale",  label: "Activité digitale",  max: 25 },
  { key: "coherenceMarche",   label: "Cohérence marché",   max: 25 },
  { key: "tailleCapacite",    label: "Taille & capacité",  max: 20 },
  { key: "contactDecideur",   label: "Contact décideur",   max: 15 },
  { key: "liberteOta",        label: "Liberté OTA",        max: 15 },
];

// ─── Sub-components ───────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      variant="labelMedium"
      sx={{
        display: "block",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: "text.secondary",
        mb: 1.5,
        fontWeight: 700,
      }}
    >
      {children}
    </Typography>
  );
}

function InfoRow({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  href?: string;
}) {
  return (
    <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5, py: 0.75 }}>
      <Box
        sx={{
          mt: "2px",
          color: "text.secondary",
          display: "flex",
          alignItems: "center",
          flexShrink: 0,
          width: 20,
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="labelSmall" color="text.secondary" sx={{ display: "block", mb: 0.125 }}>
          {label}
        </Typography>
        {href ? (
          <Link
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            underline="hover"
            sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}
          >
            <Typography variant="bodySmall" sx={{ fontWeight: 500 }}>
              {value}
            </Typography>
            <OpenInNewRoundedIcon sx={{ fontSize: 12, opacity: 0.7 }} />
          </Link>
        ) : (
          <Typography variant="bodySmall" sx={{ fontWeight: 500, wordBreak: "break-word" }}>
            {value}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

function ScoreBreakdownSection({ prospect }: { prospect: Prospect }) {
  const theme = useTheme();
  const total = scoreTotal(prospect.score);
  const color = scoreColor(total);
  const muiColor = theme.palette[color].main;

  return (
    <Box>
      {/* Total score hero */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          mb: 2,
          p: 2,
          borderRadius: 2,
          bgcolor: alpha(muiColor, 0.06),
          border: `1px solid ${alpha(muiColor, 0.2)}`,
        }}
      >
        <Box
          sx={{
            width: 52,
            height: 52,
            borderRadius: "50%",
            bgcolor: alpha(muiColor, 0.15),
            border: `2px solid ${alpha(muiColor, 0.4)}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {total >= 75 ? (
            <StarRateRoundedIcon sx={{ color: muiColor, fontSize: 26 }} />
          ) : (
            <WarningAmberRoundedIcon sx={{ color: muiColor, fontSize: 24 }} />
          )}
        </Box>
        <Box sx={{ flex: 1 }}>
          <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.5 }}>
            <Typography sx={{ fontSize: "2rem", fontWeight: 800, lineHeight: 1, color: muiColor }}>
              {total}
            </Typography>
            <Typography variant="bodySmall" color="text.secondary">
              / 100
            </Typography>
          </Box>
          <Typography variant="bodySmall" color="text.secondary">
            {total >= 85
              ? "Prospect premium — prêt pour outreach prioritaire"
              : total >= 75
              ? "Qualifié — prêt pour outreach"
              : "Sous le seuil — mise en veille recommandée"}
          </Typography>
        </Box>
      </Box>

      {/* Per-criterion bars */}
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        {SCORE_CRITERIA.map(({ key, label, max }) => {
          const val = prospect.score[key];
          const pct = (val / max) * 100;
          const critColor =
            pct >= 80 ? theme.palette.success.main
            : pct >= 50 ? theme.palette.warning.main
            : theme.palette.error.main;

          return (
            <Box key={key}>
              <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                <Typography variant="bodySmall" sx={{ fontWeight: 500 }}>
                  {label}
                </Typography>
                <Typography
                  variant="labelSmall"
                  sx={{ fontWeight: 700, color: critColor }}
                >
                  {val}
                  <Typography component="span" variant="labelSmall" color="text.disabled">
                    /{max}
                  </Typography>
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={pct}
                sx={{
                  height: 6,
                  borderRadius: 3,
                  bgcolor: alpha(critColor, 0.12),
                  "& .MuiLinearProgress-bar": { bgcolor: critColor, borderRadius: 3 },
                }}
              />
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

// ─── Outreach helpers ─────────────────────────────────────────────────────

const STEP_LABELS: Record<string, string> = {
  j0:  "Email initial (J0)",
  j3:  "Relance J+3",
  j7:  "Relance J+7",
  j30: "Réactivation J+30",
};

const STEP_ORDER = ["j0", "j3", "j7", "j30"];

const EMAIL_STATUT_CHIP: Record<
  string,
  { label: string; color: "default" | "warning" | "info" | "success" | "primary" | "error" }
> = {
  draft:     { label: "Brouillon",  color: "warning" },
  validated: { label: "Validé",     color: "info" },
  sent:      { label: "Envoyé",     color: "success" },
  opened:    { label: "Ouvert",     color: "success" },
  clicked:   { label: "Cliqué",     color: "primary" },
};

// ─── OutreachSection ──────────────────────────────────────────────────────

interface OutreachSectionProps {
  prospectId: string;
  prospectScore: number;
}

function OutreachSection({ prospectId, prospectScore }: OutreachSectionProps) {
  const { showSnackbar } = useSnackbar();

  const [emails, setEmails]             = useState<RawOutreachEmail[]>([]);
  const [recommendation, setRec]        = useState<{ next_step: string | null; reason: string } | null>(null);
  const [loadingEmails, setLoadingEmails] = useState(true);
  const [emailError, setEmailError]     = useState<string | null>(null);
  const [generating, setGenerating]     = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  // per-step selected variant tab; keyed by step ("j0" → "A")
  const [variantTab, setVariantTab]     = useState<Record<string, string>>({});

  const fetchEmails = useCallback(async () => {
    setLoadingEmails(true);
    setEmailError(null);
    try {
      const result = await outreachApi.nextStep(prospectId);
      setEmails(result.emails);
      setRec({ next_step: result.next_step, reason: result.reason });
    } catch (err) {
      setEmailError(
        err instanceof ApiError ? err.detail : "Impossible de charger les emails.",
      );
    } finally {
      setLoadingEmails(false);
    }
  }, [prospectId]);

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const newEmails = await outreachApi.generate(prospectId);
      setEmails(newEmails);
      setRec({ next_step: null, reason: "Emails générés — validation humaine requise avant envoi." });
      showSnackbar({ message: "3 variantes J0 générées avec succès.", severity: "success" });
    } catch (err) {
      showSnackbar({
        message: err instanceof ApiError ? err.detail : "Erreur lors de la génération.",
        severity: "error",
      });
    } finally {
      setGenerating(false);
    }
  }

  async function handleValidate(emailId: string) {
    setActionLoading((prev) => ({ ...prev, [emailId]: true }));
    try {
      const updated = await outreachApi.validate(emailId);
      setEmails((prev) => prev.map((e) => (e.id === emailId ? updated : e)));
      showSnackbar({ message: "Email validé — prêt à envoyer.", severity: "success" });
    } catch (err) {
      showSnackbar({
        message: err instanceof ApiError ? err.detail : "Erreur lors de la validation.",
        severity: "error",
      });
    } finally {
      setActionLoading((prev) => ({ ...prev, [emailId]: false }));
    }
  }

  async function handleSend(emailId: string) {
    setActionLoading((prev) => ({ ...prev, [emailId]: true }));
    try {
      const updated = await outreachApi.send(emailId);
      setEmails((prev) => prev.map((e) => (e.id === emailId ? updated : e)));
      showSnackbar({ message: "Email envoyé avec succès.", severity: "success" });
    } catch (err) {
      showSnackbar({
        message: err instanceof ApiError ? err.detail : "Erreur lors de l'envoi.",
        severity: "error",
      });
    } finally {
      setActionLoading((prev) => ({ ...prev, [emailId]: false }));
    }
  }

  // Group emails by sequence step, ordered j0 → j30
  const emailsByStep = useMemo(() => {
    const map: Record<string, RawOutreachEmail[]> = {};
    for (const e of emails) {
      (map[e.sequence_step] ??= []).push(e);
    }
    return map;
  }, [emails]);

  const steps = STEP_ORDER.filter((s) => s in emailsByStep);

  // ── Loading skeleton ───────────────────────────────────────────
  if (loadingEmails) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        <Skeleton variant="rounded" height={40} sx={{ borderRadius: 2 }} />
        <Skeleton variant="rounded" height={140} sx={{ borderRadius: 2 }} />
      </Box>
    );
  }

  // ── Error ──────────────────────────────────────────────────────
  if (emailError) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={fetchEmails}>
            Réessayer
          </Button>
        }
        sx={{ borderRadius: 2 }}
      >
        {emailError}
      </Alert>
    );
  }

  // ── Empty state: no emails generated yet ───────────────────────
  if (emails.length === 0) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 1.5,
          py: 2,
          px: 1,
          borderRadius: 2,
          border: 1,
          borderStyle: "dashed",
          borderColor: "divider",
          textAlign: "center",
        }}
      >
        <EmailOutlinedIcon sx={{ fontSize: 32, color: "text.disabled" }} />
        <Box>
          <Typography variant="bodySmall" sx={{ fontWeight: 600, display: "block" }}>
            Aucun email généré
          </Typography>
          <Typography variant="bodySmall" color="text.secondary">
            {prospectScore >= 75
              ? "Ce prospect est qualifié. Générez les 3 variantes J0 pour démarrer la séquence."
              : "Score insuffisant (<75). La génération reste possible mais l'envoi n'est pas recommandé."}
          </Typography>
        </Box>
        <Button
          variant="contained"
          size="small"
          startIcon={generating ? <CircularProgress size={14} color="inherit" /> : <AutoAwesomeRoundedIcon />}
          onClick={handleGenerate}
          disabled={generating}
        >
          {generating ? "Génération en cours…" : "Générer les variantes J0"}
        </Button>
      </Box>
    );
  }

  // ── Emails exist: show recommendation + steps ──────────────────
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {/* Recommendation banner */}
      {recommendation && (
        <Alert
          severity={recommendation.next_step ? "info" : "success"}
          icon={recommendation.next_step ? <InfoOutlinedIcon fontSize="small" /> : <MarkEmailReadRoundedIcon fontSize="small" />}
          sx={{ borderRadius: 2, fontSize: "0.8125rem", py: 0.75 }}
        >
          {recommendation.reason}
          {recommendation.next_step && (
            <Typography variant="labelSmall" sx={{ display: "block", mt: 0.25, fontWeight: 700 }}>
              Prochaine étape recommandée : {STEP_LABELS[recommendation.next_step] ?? recommendation.next_step}
            </Typography>
          )}
        </Alert>
      )}

      {/* Email steps */}
      {steps.map((step) => {
        const variants = emailsByStep[step];
        const selectedVariant = variantTab[step] ?? variants[0].variant;
        const selectedEmail   = variants.find((e) => e.variant === selectedVariant) ?? variants[0];
        const isLoading       = actionLoading[selectedEmail.id] ?? false;
        const statut          = EMAIL_STATUT_CHIP[selectedEmail.statut] ?? { label: selectedEmail.statut, color: "default" as const };
        const isSentOrBeyond  = ["sent", "opened", "clicked"].includes(selectedEmail.statut);

        return (
          <Box
            key={step}
            sx={{
              border: 1,
              borderColor: "divider",
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            {/* Step header */}
            <Box
              sx={{
                px: 2,
                py: 1,
                bgcolor: "action.hover",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderBottom: 1,
                borderColor: "divider",
              }}
            >
              <Typography variant="labelSmall" sx={{ fontWeight: 700 }}>
                {STEP_LABELS[step] ?? step.toUpperCase()}
              </Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                {selectedEmail.date_envoi_prevu && (
                  <Typography variant="labelSmall" color="text.secondary">
                    {new Date(selectedEmail.date_envoi_prevu).toLocaleDateString("fr-FR", {
                      day: "numeric",
                      month: "short",
                    })}
                  </Typography>
                )}
                <Chip
                  label={statut.label}
                  color={statut.color}
                  size="small"
                  sx={{ height: 18, fontSize: "0.5625rem", fontWeight: 700, "& .MuiChip-label": { px: 0.75 } }}
                />
              </Box>
            </Box>

            {/* Variant tabs — only when multiple variants exist */}
            {variants.length > 1 && (
              <Tabs
                value={selectedVariant}
                onChange={(_, v: string) => setVariantTab((prev) => ({ ...prev, [step]: v }))}
                variant="fullWidth"
                sx={{
                  minHeight: 32,
                  borderBottom: 1,
                  borderColor: "divider",
                  "& .MuiTab-root": { minHeight: 32, fontSize: "0.6875rem", fontWeight: 700, py: 0.5 },
                  "& .MuiTabs-indicator": { height: 2 },
                }}
              >
                {variants.map((v) => (
                  <Tab
                    key={v.variant}
                    label={`Variante ${v.variant}`}
                    value={v.variant}
                    icon={
                      ["sent", "opened", "clicked"].includes(v.statut) ? (
                        <MarkEmailReadRoundedIcon sx={{ fontSize: 12 }} />
                      ) : v.statut === "validated" ? (
                        <VerifiedRoundedIcon sx={{ fontSize: 12 }} />
                      ) : undefined
                    }
                    iconPosition="end"
                  />
                ))}
              </Tabs>
            )}

            {/* Email content */}
            <Box sx={{ px: 2, py: 1.5, display: "flex", flexDirection: "column", gap: 1.25 }}>
              {/* Subject */}
              <Box>
                <Typography variant="labelSmall" color="text.secondary" sx={{ display: "block", mb: 0.25 }}>
                  Objet
                </Typography>
                <Typography variant="bodySmall" sx={{ fontWeight: 600 }}>
                  {selectedEmail.sujet}
                </Typography>
              </Box>

              {/* Body */}
              <Box>
                <Typography variant="labelSmall" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                  Corps de l&apos;email
                </Typography>
                <Box
                  sx={{
                    maxHeight: 200,
                    overflowY: "auto",
                    bgcolor: "action.hover",
                    borderRadius: 1.5,
                    px: 1.5,
                    py: 1.25,
                    fontSize: "0.75rem",
                    lineHeight: 1.6,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    fontFamily: "inherit",
                    color: "text.primary",
                    "&::-webkit-scrollbar": { width: 3 },
                    "&::-webkit-scrollbar-thumb": { bgcolor: "divider", borderRadius: 2 },
                  }}
                >
                  {selectedEmail.corps}
                </Box>
              </Box>

              {/* Actions */}
              {!isSentOrBeyond && (
                <Box sx={{ display: "flex", gap: 1, pt: 0.5 }}>
                  {selectedEmail.statut === "draft" && (
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={
                        isLoading ? (
                          <CircularProgress size={14} color="inherit" />
                        ) : (
                          <VerifiedRoundedIcon />
                        )
                      }
                      onClick={() => handleValidate(selectedEmail.id)}
                      disabled={isLoading}
                      sx={{ flex: 1, borderRadius: 2 }}
                    >
                      {isLoading ? "Validation…" : "Valider"}
                    </Button>
                  )}
                  {selectedEmail.statut === "validated" && (
                    <Button
                      variant="contained"
                      size="small"
                      color="success"
                      startIcon={
                        isLoading ? (
                          <CircularProgress size={14} color="inherit" />
                        ) : (
                          <SendRoundedIcon />
                        )
                      }
                      onClick={() => handleSend(selectedEmail.id)}
                      disabled={isLoading}
                      sx={{ flex: 1, borderRadius: 2 }}
                    >
                      {isLoading ? "Envoi…" : "Envoyer"}
                    </Button>
                  )}
                </Box>
              )}

              {/* Sent confirmation */}
              {isSentOrBeyond && selectedEmail.date_envoi_reel && (
                <Typography variant="labelSmall" color="text.secondary" sx={{ display: "block" }}>
                  Envoyé le{" "}
                  {new Date(selectedEmail.date_envoi_reel).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </Typography>
              )}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

// ─── Edit form ────────────────────────────────────────────────────────────

const PARTNER_TYPES: PartnerType[] = [
  "hotel_riad", "hotel_luxe", "tour_operateur", "agence_voyage",
  "prestataire_activites", "transport", "to_golfe", "mice",
];
const LANGUES: { value: OutreachLanguage; label: string }[] = [
  { value: "fr", label: "Français" },
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "de", label: "Deutsch" },
  { value: "ar", label: "العربية" },
];

interface EditForm {
  nom: string;
  type: PartnerType;
  pays: string;
  ville: string;
  region: string;
  adresseWeb: string;
  emailContact: string;
  linkedinContact: string;
  nomContact: string;
  posteContact: string;
  nbChambres: string;
  capaciteDescription: string;
  presenceBooking: boolean;
  noteBooking: string;
  presenceExpedia: boolean;
  commissionStandard: string;
  commissionPlancher: string;
  langue: OutreachLanguage;
  dateProchainContact: string;
}

function prospectToEditForm(p: Prospect): EditForm {
  return {
    nom: p.nom,
    type: p.type,
    pays: p.pays,
    ville: p.ville,
    region: p.region ?? "",
    adresseWeb: p.adresseWeb,
    emailContact: p.emailContact,
    linkedinContact: p.linkedinContact ?? "",
    nomContact: p.nomContact,
    posteContact: p.posteContact,
    nbChambres: p.nbChambres != null ? String(p.nbChambres) : "",
    capaciteDescription: p.capaciteDescription ?? "",
    presenceBooking: p.presenceBooking,
    noteBooking: p.noteBooking != null ? String(p.noteBooking) : "",
    presenceExpedia: p.presenceExpedia,
    commissionStandard: String(p.commissionStandard),
    commissionPlancher: String(p.commissionPlancher),
    langue: p.langue as OutreachLanguage,
    dateProchainContact: p.dateProchainContact ?? "",
  };
}

function EditProspectForm({
  form,
  onChange,
}: {
  form: EditForm;
  onChange: (next: EditForm) => void;
}) {
  const set = (key: keyof EditForm, value: string | boolean) =>
    onChange({ ...form, [key]: value });

  const cities = (CITIES_BY_COUNTRY as Record<string, string[]>)[form.pays] ?? [];

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {/* Identité */}
      <Box>
        <Typography variant="labelMedium" sx={{ display: "block", textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary", fontWeight: 700, mb: 1.5 }}>
          Identité
        </Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          <TextField size="small" label="Nom de l'établissement" fullWidth value={form.nom} onChange={(e) => set("nom", e.target.value)} />
          <FormControl size="small" fullWidth>
            <InputLabel>Type de partenaire</InputLabel>
            <Select value={form.type} label="Type de partenaire" onChange={(e) => set("type", e.target.value as PartnerType)}>
              {PARTNER_TYPES.map((t) => <MenuItem key={t} value={t}>{PARTNER_TYPE_LABELS[t]}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" fullWidth>
            <InputLabel>Langue</InputLabel>
            <Select value={form.langue} label="Langue" onChange={(e) => set("langue", e.target.value as OutreachLanguage)}>
              {LANGUES.map((l) => <MenuItem key={l.value} value={l.value}>{LANGUAGE_FLAGS[l.value]} {l.label}</MenuItem>)}
            </Select>
          </FormControl>
        </Box>
      </Box>

      <Divider />

      {/* Localisation */}
      <Box>
        <Typography variant="labelMedium" sx={{ display: "block", textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary", fontWeight: 700, mb: 1.5 }}>
          Localisation
        </Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          <Autocomplete
            freeSolo
            options={COUNTRIES as unknown as string[]}
            value={form.pays}
            onInputChange={(_, v) => set("pays", v)}
            renderInput={(params) => <TextField {...params} size="small" label="Pays" />}
          />
          <Autocomplete
            freeSolo
            options={cities}
            value={form.ville}
            onInputChange={(_, v) => set("ville", v)}
            renderInput={(params) => <TextField {...params} size="small" label="Ville" />}
          />
          <TextField size="small" label="Région (optionnel)" fullWidth value={form.region} onChange={(e) => set("region", e.target.value)} />
          <TextField size="small" label="Site web" fullWidth value={form.adresseWeb} onChange={(e) => set("adresseWeb", e.target.value)} />
        </Box>
      </Box>

      <Divider />

      {/* Contact */}
      <Box>
        <Typography variant="labelMedium" sx={{ display: "block", textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary", fontWeight: 700, mb: 1.5 }}>
          Contact décideur
        </Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          <TextField size="small" label="Nom du contact" fullWidth value={form.nomContact} onChange={(e) => set("nomContact", e.target.value)} />
          <TextField size="small" label="Poste / Fonction" fullWidth value={form.posteContact} onChange={(e) => set("posteContact", e.target.value)} />
          <TextField size="small" label="Email" fullWidth value={form.emailContact} onChange={(e) => set("emailContact", e.target.value)} />
          <TextField size="small" label="LinkedIn (optionnel)" fullWidth value={form.linkedinContact} onChange={(e) => set("linkedinContact", e.target.value)} />
          <TextField size="small" label="Prochain contact (YYYY-MM-DD)" fullWidth value={form.dateProchainContact} onChange={(e) => set("dateProchainContact", e.target.value)} />
        </Box>
      </Box>

      <Divider />

      {/* Établissement */}
      <Box>
        <Typography variant="labelMedium" sx={{ display: "block", textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary", fontWeight: 700, mb: 1.5 }}>
          Établissement
        </Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
            <TextField size="small" label="Nb. chambres" type="number" value={form.nbChambres} onChange={(e) => set("nbChambres", e.target.value)} />
            <TextField size="small" label="Note Booking" type="number" value={form.noteBooking} onChange={(e) => set("noteBooking", e.target.value)} slotProps={{ htmlInput: { step: 0.1, min: 0, max: 10 } }} />
          </Box>
          <TextField size="small" label="Capacité (description)" fullWidth value={form.capaciteDescription} onChange={(e) => set("capaciteDescription", e.target.value)} />
          <Box sx={{ display: "flex", gap: 2 }}>
            <FormControlLabel
              control={<Switch checked={form.presenceBooking} onChange={(e) => set("presenceBooking", e.target.checked)} size="small" />}
              label={<Typography variant="bodySmall">Booking.com</Typography>}
            />
            <FormControlLabel
              control={<Switch checked={form.presenceExpedia} onChange={(e) => set("presenceExpedia", e.target.checked)} size="small" />}
              label={<Typography variant="bodySmall">Expedia</Typography>}
            />
          </Box>
        </Box>
      </Box>

      <Divider />

      {/* Commission */}
      <Box>
        <Typography variant="labelMedium" sx={{ display: "block", textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary", fontWeight: 700, mb: 1.5 }}>
          Commission
        </Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
          <TextField size="small" label="Taux standard (%)" type="number" value={form.commissionStandard} onChange={(e) => set("commissionStandard", e.target.value)} slotProps={{ htmlInput: { step: 0.5, min: 0, max: 100 } }} />
          <TextField size="small" label="Plancher absolu (%)" type="number" value={form.commissionPlancher} onChange={(e) => set("commissionPlancher", e.target.value)} slotProps={{ htmlInput: { step: 0.5, min: 0, max: 100 } }} />
        </Box>
      </Box>
    </Box>
  );
}

// ─── Props ─────────────────────────────────────────────────────────────────

export interface ProspectDrawerProps {
  prospect: Prospect | null;
  open: boolean;
  onClose: () => void;
  onStageChange: (id: string, stage: PipelineStage) => void;
  onNotesChange: (id: string, notes: string) => void;
  onDelete?: (id: string) => void;
  onUpdate?: (updated: Prospect) => void;
}

// ─── Main component ────────────────────────────────────────────────────────

export default function ProspectDrawer({
  prospect,
  open,
  onClose,
  onStageChange,
  onNotesChange,
  onDelete,
  onUpdate,
}: ProspectDrawerProps) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));
  const { showSnackbar } = useSnackbar();

  // Local notes state — synced when prospect changes
  const [notes, setNotes] = useState(prospect?.notes ?? "");
  useEffect(() => {
    setNotes(prospect?.notes ?? "");
  }, [prospect?.id, prospect?.notes]);

  // Edit mode state
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);

  // Delete state
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Reset edit mode when prospect changes
  useEffect(() => {
    setEditMode(false);
    setEditForm(null);
  }, [prospect?.id]);

  function handleStartEdit() {
    if (!prospect) return;
    setEditForm(prospectToEditForm(prospect));
    setEditMode(true);
  }

  function handleCancelEdit() {
    setEditMode(false);
    setEditForm(null);
  }

  async function handleSaveEdit() {
    if (!prospect || !editForm) return;
    setSaving(true);
    try {
      const updated = await prospectsApi.update(prospect.id, {
        nom: editForm.nom,
        type: editForm.type as PartnerType,
        pays: editForm.pays,
        ville: editForm.ville,
        region: editForm.region || undefined,
        adresseWeb: editForm.adresseWeb,
        emailContact: editForm.emailContact,
        linkedinContact: editForm.linkedinContact || undefined,
        nomContact: editForm.nomContact,
        posteContact: editForm.posteContact,
        nbChambres: editForm.nbChambres ? parseInt(editForm.nbChambres, 10) : undefined,
        capaciteDescription: editForm.capaciteDescription || undefined,
        presenceBooking: editForm.presenceBooking,
        noteBooking: editForm.noteBooking ? parseFloat(editForm.noteBooking) : undefined,
        presenceExpedia: editForm.presenceExpedia,
        commissionStandard: parseFloat(editForm.commissionStandard),
        commissionPlancher: parseFloat(editForm.commissionPlancher),
        langue: editForm.langue,
        dateProchainContact: editForm.dateProchainContact || undefined,
      } as Partial<Prospect>);
      onUpdate?.(updated);
      setEditMode(false);
      setEditForm(null);
      showSnackbar({ message: `${updated.nom} mis à jour.`, severity: "success", duration: 3000 });
    } catch (err) {
      showSnackbar({
        message: err instanceof ApiError ? err.detail : "Erreur lors de la mise à jour.",
        severity: "error",
        duration: 5000,
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmDelete() {
    if (!prospect) return;
    setDeleting(true);
    try {
      await prospectsApi.delete(prospect.id);
      onDelete?.(prospect.id);
      setConfirmDelete(false);
      onClose();
      showSnackbar({ message: `${prospect.nom} supprimé.`, severity: "warning", duration: 4000 });
    } catch (err) {
      showSnackbar({
        message: err instanceof ApiError ? err.detail : "Erreur lors de la suppression.",
        severity: "error",
        duration: 5000,
      });
    } finally {
      setDeleting(false);
    }
  }

  function handleNotesBlur() {
    if (prospect && notes !== (prospect.notes ?? "")) {
      onNotesChange(prospect.id, notes);
    }
  }

  const needsHumanValidation = prospect?.notes?.includes("VALIDATION HUMAINE REQUISE") ?? false;

  const drawerContent = prospect ? (
    <Box
      sx={{
        width: isDesktop ? DRAWER_WIDTH : "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* ── Sticky header ─────────────────────────────────────────── */}
      <Box
        sx={{
          px: 2.5,
          pt: isDesktop ? 2.5 : 1,
          pb: 2,
          borderBottom: 1,
          borderColor: "divider",
          bgcolor: "background.paper",
          flexShrink: 0,
        }}
      >
        {/* Mobile puller */}
        {!isDesktop && (
          <Box sx={{ display: "flex", justifyContent: "center", mb: 1 }}>
            <Box
              sx={{ width: 32, height: 4, borderRadius: 2, bgcolor: "divider" }}
            />
          </Box>
        )}

        {/* Header: title + action buttons */}
        <Box sx={{ display: "flex", alignItems: "flex-start", mb: 1.5 }}>
          <Box sx={{ flex: 1 }}>
            {needsHumanValidation && !editMode && (
              <Alert
                severity="error"
                icon={<WarningAmberRoundedIcon fontSize="small" />}
                sx={{
                  py: 0.5,
                  mb: 1.5,
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  borderRadius: 2,
                  "& .MuiAlert-message": { fontWeight: 700 },
                }}
              >
                VALIDATION HUMAINE REQUISE
              </Alert>
            )}
            <Typography
              variant="titleLarge"
              component="h2"
              sx={{ fontWeight: 700, lineHeight: 1.25, pr: 1 }}
            >
              {editMode && editForm ? editForm.nom || prospect.nom : prospect.nom}
            </Typography>
          </Box>

          {/* View mode: Edit + Delete + Close */}
          {!editMode && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <Tooltip title="Modifier ce prospect">
                <IconButton onClick={handleStartEdit} size="small" aria-label="Modifier">
                  <EditRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Supprimer ce prospect">
                <IconButton
                  onClick={() => setConfirmDelete(true)}
                  size="small"
                  aria-label="Supprimer"
                  sx={{ color: "error.main" }}
                >
                  <DeleteRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <IconButton onClick={onClose} size="small" aria-label="Fermer" sx={{ ml: 0.5 }}>
                <CloseRoundedIcon fontSize="small" />
              </IconButton>
            </Box>
          )}

          {/* Edit mode: Save + Cancel */}
          {editMode && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <Tooltip title="Enregistrer les modifications">
                <span>
                  <IconButton
                    onClick={handleSaveEdit}
                    size="small"
                    aria-label="Enregistrer"
                    disabled={saving}
                    sx={{ color: "primary.main" }}
                  >
                    {saving ? (
                      <CircularProgress size={16} color="inherit" thickness={4} />
                    ) : (
                      <SaveRoundedIcon fontSize="small" />
                    )}
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Annuler">
                <IconButton onClick={handleCancelEdit} size="small" aria-label="Annuler" disabled={saving}>
                  <CancelRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          )}
        </Box>

        {/* Chips row */}
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, alignItems: "center" }}>
          <Chip
            label={PARTNER_TYPE_LABELS[prospect.type]}
            color={TYPE_COLORS[prospect.type]}
            size="small"
            sx={{ fontWeight: 600, fontSize: "0.6875rem" }}
          />
          <Chip
            label={STAGE_LABELS[prospect.stage]}
            color={STAGE_COLORS[prospect.stage]}
            size="small"
            variant="outlined"
            sx={{ fontWeight: 600, fontSize: "0.6875rem" }}
          />
          <Tooltip title={prospect.langue.toUpperCase()} placement="top">
            <Typography component="span" sx={{ fontSize: "1.125rem", lineHeight: 1 }}>
              {LANGUAGE_FLAGS[prospect.langue]}
            </Typography>
          </Tooltip>
          {prospect.adresseWeb && (
            <Link
              href={
                prospect.adresseWeb.startsWith("http")
                  ? prospect.adresseWeb
                  : `https://${prospect.adresseWeb}`
              }
              target="_blank"
              rel="noopener noreferrer"
              underline="hover"
              sx={{ display: "inline-flex", alignItems: "center", gap: 0.25, fontSize: "0.75rem" }}
            >
              {prospect.adresseWeb.replace(/^https?:\/\//, "")}
              <OpenInNewRoundedIcon sx={{ fontSize: 11 }} />
            </Link>
          )}
        </Box>
      </Box>

      {/* ── Scrollable body ────────────────────────────────────────── */}
      <Box
        sx={{
          flex: 1,
          overflowY: "auto",
          px: 2.5,
          py: 2.5,
          display: "flex",
          flexDirection: "column",
          gap: 3,
          "&::-webkit-scrollbar": { width: 4 },
          "&::-webkit-scrollbar-thumb": { bgcolor: "divider", borderRadius: 2 },
        }}
      >
        {/* ── Edit form (edit mode only) ────────────────────────── */}
        {editMode && editForm && (
          <EditProspectForm form={editForm} onChange={setEditForm} />
        )}

        {/* ── Read-only sections (view mode only) ──────────────── */}
        {!editMode && <>

        {/* ── Score Breakdown ──────────────────────────────────────── */}
        <Box>
          <SectionTitle>Score de qualification</SectionTitle>
          <ScoreBreakdownSection prospect={prospect} />
        </Box>

        <Divider />

        {/* ── Contact ─────────────────────────────────────────────── */}
        <Box>
          <SectionTitle>Contact décideur</SectionTitle>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2 }}>
            <Avatar
              sx={{
                width: 40,
                height: 40,
                bgcolor: "primary.main",
                fontSize: "0.875rem",
                fontWeight: 700,
              }}
            >
              {prospect.nomContact
                .split(" ")
                .map((w) => w[0])
                .slice(0, 2)
                .join("")
                .toUpperCase()}
            </Avatar>
            <Box>
              <Typography variant="bodyMedium" sx={{ fontWeight: 700, display: "block" }}>
                {prospect.nomContact}
              </Typography>
              <Typography variant="bodySmall" color="text.secondary">
                {prospect.posteContact}
              </Typography>
            </Box>
          </Box>

          <InfoRow
            icon={<EmailOutlinedIcon sx={{ fontSize: 16 }} />}
            label="Email"
            value={prospect.emailContact}
            href={`mailto:${prospect.emailContact}`}
          />

          {prospect.linkedinContact && (
            <InfoRow
              icon={<LinkedInIcon sx={{ fontSize: 16 }} />}
              label="LinkedIn"
              value="Voir le profil"
              href={
                prospect.linkedinContact.startsWith("http")
                  ? prospect.linkedinContact
                  : `https://${prospect.linkedinContact}`
              }
            />
          )}

          {prospect.dateProchainContact && (
            <InfoRow
              icon={<CalendarTodayOutlinedIcon sx={{ fontSize: 16 }} />}
              label="Prochain contact"
              value={new Date(prospect.dateProchainContact).toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            />
          )}
        </Box>

        <Divider />

        {/* ── Property details ─────────────────────────────────────── */}
        <Box>
          <SectionTitle>Informations établissement</SectionTitle>

          <InfoRow
            icon={<PlaceOutlinedIcon sx={{ fontSize: 16 }} />}
            label="Localisation"
            value={
              prospect.region
                ? `${prospect.ville}, ${prospect.region} — ${prospect.pays}`
                : `${prospect.ville}, ${prospect.pays}`
            }
          />

          {(prospect.nbChambres != null || prospect.capaciteDescription) && (
            <InfoRow
              icon={<BedOutlinedIcon sx={{ fontSize: 16 }} />}
              label="Capacité"
              value={
                prospect.nbChambres != null
                  ? `${prospect.nbChambres} chambres${prospect.capaciteDescription ? ` — ${prospect.capaciteDescription}` : ""}`
                  : prospect.capaciteDescription ?? "—"
              }
            />
          )}

          <InfoRow
            icon={<CalendarTodayOutlinedIcon sx={{ fontSize: 16 }} />}
            label="Date d'ajout"
            value={new Date(prospect.dateAjout).toLocaleDateString("fr-FR", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          />

          {/* OTA presence */}
          <Box sx={{ mt: 1 }}>
            <Typography
              variant="labelSmall"
              color="text.secondary"
              sx={{ display: "block", mb: 0.75 }}
            >
              Présence OTA concurrentes
            </Typography>
            <Box sx={{ display: "flex", gap: 2 }}>
              {[
                {
                  label: prospect.noteBooking
                    ? `Booking.com · ${prospect.noteBooking}★`
                    : "Booking.com",
                  present: prospect.presenceBooking,
                },
                { label: "Expedia", present: prospect.presenceExpedia },
              ].map(({ label, present }) => (
                <Box key={label} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  {present ? (
                    <CheckCircleOutlineIcon
                      sx={{ fontSize: 15, color: "success.main" }}
                    />
                  ) : (
                    <RadioButtonUncheckedIcon
                      sx={{ fontSize: 15, color: "text.disabled" }}
                    />
                  )}
                  <Typography
                    variant="bodySmall"
                    color={present ? "text.primary" : "text.disabled"}
                  >
                    {label}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        </Box>

        <Divider />

        {/* ── Commission ──────────────────────────────────────────── */}
        <Box>
          <SectionTitle>Commission</SectionTitle>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 1.5,
              mb: 1.5,
            }}
          >
            {/* Standard */}
            <Box
              sx={{
                p: 1.5,
                borderRadius: 2,
                border: 1,
                borderColor: "divider",
                textAlign: "center",
              }}
            >
              <Typography
                sx={{ fontSize: "1.75rem", fontWeight: 800, lineHeight: 1, color: "primary.main" }}
              >
                {prospect.commissionStandard}%
              </Typography>
              <Typography variant="labelSmall" color="text.secondary" sx={{ mt: 0.25, display: "block" }}>
                Taux standard
              </Typography>
            </Box>

            {/* Plancher */}
            <Box
              sx={{
                p: 1.5,
                borderRadius: 2,
                border: 1,
                borderColor: "divider",
                textAlign: "center",
              }}
            >
              <Typography
                sx={{
                  fontSize: "1.75rem",
                  fontWeight: 800,
                  lineHeight: 1,
                  color: "text.secondary",
                }}
              >
                {prospect.commissionPlancher}%
              </Typography>
              <Typography variant="labelSmall" color="text.secondary" sx={{ mt: 0.25, display: "block" }}>
                Plancher absolu
              </Typography>
            </Box>
          </Box>

          {/* Sub-plancher alert */}
          {needsHumanValidation && (
            <Alert
              severity="warning"
              icon={<WarningAmberRoundedIcon fontSize="small" />}
              sx={{ borderRadius: 2, fontSize: "0.8125rem" }}
            >
              Toute offre sous le plancher de{" "}
              <strong>{prospect.commissionPlancher}%</strong> nécessite une
              validation humaine avant envoi.
            </Alert>
          )}
        </Box>

        <Divider />

        {/* ── Outreach ─────────────────────────────────────────────── */}
        <Box>
          <SectionTitle>Séquence outreach</SectionTitle>
          <OutreachSection
            prospectId={prospect.id}
            prospectScore={scoreTotal(prospect.score)}
          />
        </Box>

        <Divider />

        {/* ── Pipeline stage selector ──────────────────────────────── */}
        <Box>
          <SectionTitle>Étape du pipeline</SectionTitle>
          <FormControl size="small" fullWidth>
            <InputLabel id={`stage-label-${prospect.id}`}>Étape</InputLabel>
            <Select
              labelId={`stage-label-${prospect.id}`}
              value={prospect.stage}
              label="Étape"
              onChange={(e) =>
                onStageChange(prospect.id, e.target.value as PipelineStage)
              }
            >
              {PIPELINE_STAGES.map((s) => (
                <MenuItem key={s} value={s}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        bgcolor:
                          s === "activation_ota" || s === "closing"
                            ? "success.main"
                            : s === "perdu"
                            ? "error.main"
                            : s === "negociation"
                            ? "secondary.main"
                            : s === "outreach"
                            ? "warning.main"
                            : s === "qualification"
                            ? "info.main"
                            : "text.disabled",
                        flexShrink: 0,
                      }}
                    />
                    {STAGE_LABELS[s]}
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        <Divider />

        {/* ── Notes ───────────────────────────────────────────────── */}
        <Box>
          <SectionTitle>Notes internes</SectionTitle>
          <TextField
            multiline
            minRows={3}
            maxRows={8}
            fullWidth
            size="small"
            placeholder="Ajouter une note sur ce partenaire…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={handleNotesBlur}
            sx={{
              "& .MuiOutlinedInput-root": { borderRadius: 2 },
            }}
          />
          <Typography variant="labelSmall" color="text.disabled" sx={{ mt: 0.75, display: "block" }}>
            Sauvegarde automatique à la perte de focus.
          </Typography>
        </Box>

        </> /* end read-only sections */}

        {/* Bottom spacer for mobile safe area */}
        <Box sx={{ pb: { xs: "env(safe-area-inset-bottom, 0px)", md: 0 } }} />
      </Box>

      {/* ── Delete confirmation dialog ──────────────────────── */}
      <ConfirmationDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleConfirmDelete}
        title="Supprimer ce prospect ?"
        description={`"${prospect.nom}" sera définitivement supprimé. Cette action est irréversible.`}
        confirmLabel="Supprimer"
        confirmColor="error"
        loading={deleting}
      />
    </Box>
  ) : null;

  // ─── Desktop: right Drawer ──────────────────────────────────────

  if (isDesktop) {
    return (
      <Drawer
        anchor="right"
        open={open}
        onClose={onClose}
        PaperProps={{
          sx: {
            width: DRAWER_WIDTH,
            boxShadow: "-4px 0 24px rgba(0,0,0,0.08)",
          },
        }}
        // Keep DOM mounted so scroll position & notes field don't reset between clicks
        keepMounted={false}
      >
        {drawerContent}
      </Drawer>
    );
  }

  // ─── Mobile: bottom SwipeableDrawer ─────────────────────────────

  return (
    <SwipeableDrawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      onOpen={() => {}}
      disableSwipeToOpen
      PaperProps={{
        sx: {
          height: "88dvh",
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          overflow: "hidden",
        },
      }}
    >
      {drawerContent}
    </SwipeableDrawer>
  );
}
