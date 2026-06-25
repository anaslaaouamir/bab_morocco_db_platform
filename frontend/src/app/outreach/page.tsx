"use client";

import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Alert from "@mui/material/Alert";
import Skeleton from "@mui/material/Skeleton";
import Tooltip from "@mui/material/Tooltip";
import CircularProgress from "@mui/material/CircularProgress";
import { alpha, useTheme } from "@mui/material/styles";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import VerifiedRoundedIcon from "@mui/icons-material/VerifiedRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";
import PauseCircleRoundedIcon from "@mui/icons-material/PauseCircleRounded";
import MarkEmailReadRoundedIcon from "@mui/icons-material/MarkEmailReadRounded";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import StarRateRoundedIcon from "@mui/icons-material/StarRateRounded";
import InboxRoundedIcon from "@mui/icons-material/InboxRounded";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";

import type { Prospect, PipelineStage } from "@/types/prospect";
import { scoreTotal, scoreColor, PARTNER_TYPE_LABELS, STAGE_LABELS, LANGUAGE_FLAGS } from "@/types/prospect";
import { useSnackbar } from "@/contexts/SnackbarContext";
import ConfirmationDialog from "@/components/shared/ConfirmationDialog";
import { prospectsApi, outreachApi, ApiError } from "@/lib/api";
import type { RawOutreachEmail } from "@/lib/api";

// ─── Constants ────────────────────────────────────────────────────────────────

const LANG_LABELS: Record<string, string> = {
  fr: "Français",
  en: "English",
  es: "Español",
  de: "Deutsch",
  ar: "العربية",
};

const VARIANT_DESCS: Record<string, string> = {
  A: "A — Direct : approche professionnelle concise avec proposition commerciale claire",
  B: "B — Bénéfices : 3 bénéfices concrets mis en avant pour maximiser l'impact",
  C: "C — Storytelling : narration émotionnelle autour du voyageur idéal",
};

// ─── Sequence helpers ─────────────────────────────────────────────────────────

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

interface SequenceStep {
  key: string;
  label: string;
  desc: string;
  date: string;
  status: "done" | "current" | "upcoming";
}

const SEQ_CONFIG = [
  { key: "j0",  offset: 0,  label: "J0",   desc: "Email initial personnalisé + CTA appel 20 min" },
  { key: "j3",  offset: 3,  label: "J+3",  desc: "Relance #1 — objet différent, bénéfice tangible" },
  { key: "j7",  offset: 7,  label: "J+7",  desc: "Relance #2 — ton direct, dernier essai" },
  { key: "j30", offset: 30, label: "J+30", desc: "Réactivation — angle saisonnier ou actualité marché" },
];

// Compute timeline from real email data — falls back to date math if no emails
function computeSequenceFromEmails(emails: RawOutreachEmail[], fallbackDate: string): SequenceStep[] {
  const byStep: Record<string, RawOutreachEmail | undefined> = {};
  for (const e of emails) {
    // prefer the variant with the highest statut progress
    const prev = byStep[e.sequence_step];
    const order = ["draft", "validated", "sent", "opened", "clicked"];
    if (!prev || order.indexOf(e.statut) > order.indexOf(prev.statut)) {
      byStep[e.sequence_step] = e;
    }
  }

  return SEQ_CONFIG.map(({ key, offset, label, desc }) => {
    const email = byStep[key];
    const date = email?.date_envoi_prevu ?? addDays(fallbackDate, offset);
    let status: SequenceStep["status"];
    if (!email) {
      // no email yet — upcoming unless a later step was sent
      const laterSent = SEQ_CONFIG
        .filter((s) => s.offset > offset)
        .some((s) => byStep[s.key] && ["sent", "opened", "clicked"].includes(byStep[s.key]!.statut));
      status = laterSent ? "done" : "upcoming";
    } else if (["sent", "opened", "clicked"].includes(email.statut)) {
      status = "done";
    } else {
      status = "current";
    }
    return { key, label, desc, date, status };
  });
}

// ─── SequenceTimeline ─────────────────────────────────────────────────────────

function SequenceTimeline({ steps }: { steps: SequenceStep[] }) {
  const theme = useTheme();

  const bgFor = (status: SequenceStep["status"]) =>
    status === "done"
      ? theme.palette.success.main
      : status === "current"
      ? theme.palette.warning.main
      : theme.palette.action.disabledBackground;

  return (
    <Box sx={{ display: "flex", alignItems: "center", mt: 1.25 }}>
      {steps.map((step, i) => (
        <React.Fragment key={step.key}>
          <Tooltip title={`${step.label}: ${step.desc} — ${step.date}`} placement="top" arrow>
            <Box
              sx={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                bgcolor: bgFor(step.status),
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                boxShadow:
                  step.status === "current"
                    ? `0 0 0 4px ${alpha(theme.palette.warning.main, 0.22)}`
                    : "none",
                transition: "box-shadow 300ms ease",
              }}
            >
              {step.status === "done" ? (
                <CheckRoundedIcon sx={{ fontSize: 13, color: "white" }} />
              ) : (
                <Typography
                  sx={{
                    fontSize: "0.5rem",
                    fontWeight: 800,
                    color: step.status === "current" ? "white" : alpha("#000", 0.3),
                    lineHeight: 1,
                    textAlign: "center",
                  }}
                >
                  {step.label}
                </Typography>
              )}
            </Box>
          </Tooltip>
          {i < steps.length - 1 && (
            <Box
              sx={{
                flex: 1,
                height: 2,
                bgcolor:
                  step.status === "done"
                    ? theme.palette.success.main
                    : theme.palette.action.disabledBackground,
                borderRadius: 1,
                mx: 0.25,
                minWidth: 6,
              }}
            />
          )}
        </React.Fragment>
      ))}
    </Box>
  );
}

// ─── OutreachProspectCard ─────────────────────────────────────────────────────

function OutreachProspectCard({
  prospect,
  emails,
  selected,
  onSelect,
}: {
  prospect: Prospect;
  emails: RawOutreachEmail[];
  selected: boolean;
  onSelect: () => void;
}) {
  const theme = useTheme();
  const steps = computeSequenceFromEmails(emails, prospect.dateAjout);
  const currentStep = steps.find((s) => s.status === "current");
  const total = scoreTotal(prospect.score);
  const color = scoreColor(total);

  return (
    <Card
      elevation={0}
      variant="outlined"
      onClick={onSelect}
      sx={{
        borderRadius: 2.5,
        borderColor: selected ? "primary.main" : "divider",
        borderWidth: selected ? 2 : 1,
        bgcolor: selected ? alpha(theme.palette.primary.main, 0.04) : "background.paper",
        transition: "border-color 150ms ease, background-color 150ms ease",
        cursor: "pointer",
        "&:hover": { boxShadow: theme.shadows[2] },
      }}
    >
      <CardContent sx={{ p: "12px 14px !important" }}>
        {/* Name + score */}
        <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1, mb: 0.75 }}>
          <Typography variant="titleSmall" sx={{ fontWeight: 700, lineHeight: 1.3, flex: 1 }}>
            {prospect.nom}
          </Typography>
          <Box
            sx={{
              px: 0.75,
              py: 0.125,
              borderRadius: 1,
              bgcolor: alpha(theme.palette[color].main, 0.12),
              border: `1px solid ${alpha(theme.palette[color].main, 0.3)}`,
              display: "flex",
              alignItems: "center",
              gap: 0.25,
              flexShrink: 0,
            }}
          >
            <StarRateRoundedIcon sx={{ fontSize: 11, color: `${color}.main` }} />
            <Typography sx={{ fontSize: "0.6875rem", fontWeight: 700, color: `${color}.main`, lineHeight: 1 }}>
              {total}
            </Typography>
          </Box>
        </Box>

        {/* Type + location + flag */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 1 }}>
          <Chip
            label={PARTNER_TYPE_LABELS[prospect.type]}
            size="small"
            sx={{ height: 18, fontSize: "0.5938rem", fontWeight: 600, "& .MuiChip-label": { px: 0.75 } }}
          />
          <PlaceOutlinedIcon sx={{ fontSize: 11, color: "text.disabled" }} />
          <Typography variant="bodySmall" color="text.secondary" noWrap sx={{ flex: 1 }}>
            {prospect.ville}
          </Typography>
          <Typography component="span" sx={{ fontSize: "0.875rem", flexShrink: 0 }}>
            {LANGUAGE_FLAGS[prospect.langue]}
          </Typography>
        </Box>

        {/* Sequence timeline */}
        <SequenceTimeline steps={steps} />

        {/* Next action label */}
        {currentStep && (
          <Typography variant="labelSmall" sx={{ mt: 0.875, display: "block", color: "warning.main", fontWeight: 600 }}>
            Prochaine action : {currentStep.label} — {currentStep.date}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

// ─── EmailComposer ────────────────────────────────────────────────────────────

function EmailComposer({
  prospect,
  onStageChange,
  onEmailsChange,
}: {
  prospect: Prospect;
  onStageChange: (id: string, stage: PipelineStage) => void;
  onEmailsChange: (prospectId: string, emails: RawOutreachEmail[]) => void;
}) {
  const { showSnackbar } = useSnackbar();
  const TODAY = new Date().toISOString().split("T")[0];

  // ── Email state ─────────────────────────────────────────────────
  const [emails, setEmails]               = useState<RawOutreachEmail[]>([]);
  const [recommendation, setRec]          = useState<string | null>(null);
  const [loadingEmails, setLoadingEmails] = useState(true);
  const [emailError, setEmailError]       = useState<string | null>(null);
  const [generating, setGenerating]       = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  // ── UI state ─────────────────────────────────────────────────────
  const [selectedVariant, setSelectedVariant] = useState<string>("A");
  const [editMode, setEditMode]               = useState(false);
  const [editSubject, setEditSubject]         = useState("");
  const [editBody, setEditBody]               = useState("");
  const [confirmType, setConfirmType]         = useState<"validate" | "send" | "negociation" | "veille" | null>(null);

  // Track the prospect ID we last fetched for, so switching prospects resets state
  const fetchedForRef = useRef<string | null>(null);

  const fetchEmails = useCallback(async (prospectId: string) => {
    setLoadingEmails(true);
    setEmailError(null);
    try {
      const result = await outreachApi.nextStep(prospectId);
      setEmails(result.emails);
      setRec(result.reason);
      onEmailsChange(prospectId, result.emails);
    } catch (err) {
      setEmailError(err instanceof ApiError ? err.detail : "Impossible de charger les emails.");
    } finally {
      setLoadingEmails(false);
    }
  }, [onEmailsChange]);

  useEffect(() => {
    if (fetchedForRef.current === prospect.id) return;
    fetchedForRef.current = prospect.id;
    setEmails([]);
    setRec(null);
    setSelectedVariant("A");
    setEditMode(false);
    fetchEmails(prospect.id);
  }, [prospect.id, fetchEmails]);

  // j0 emails only — the main action set
  const j0Emails = useMemo(() => emails.filter((e) => e.sequence_step === "j0"), [emails]);

  // The email for the currently selected variant tab
  const selectedEmail = useMemo(
    () => j0Emails.find((e) => e.variant === selectedVariant) ?? j0Emails[0] ?? null,
    [j0Emails, selectedVariant],
  );

  // Reset edit mode when switching variant or prospect
  useEffect(() => { setEditMode(false); }, [selectedVariant, prospect.id]);

  // ── Handlers ─────────────────────────────────────────────────────

  async function handleGenerate() {
    setGenerating(true);
    try {
      const newEmails = await outreachApi.generate(prospect.id);
      setEmails(newEmails);
      setRec("Emails générés — validation humaine requise avant envoi.");
      setSelectedVariant("A");
      onEmailsChange(prospect.id, newEmails);
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

  async function handleValidate() {
    if (!selectedEmail) return;
    setActionLoading((prev) => ({ ...prev, [selectedEmail.id]: true }));
    try {
      const updated = await outreachApi.validate(selectedEmail.id);
      const next = emails.map((e) => (e.id === selectedEmail.id ? updated : e));
      setEmails(next);
      onEmailsChange(prospect.id, next);
      showSnackbar({ message: `Variante ${selectedEmail.variant} validée — prête à envoyer.`, severity: "success" });
    } catch (err) {
      showSnackbar({
        message: err instanceof ApiError ? err.detail : "Erreur lors de la validation.",
        severity: "error",
      });
    } finally {
      setActionLoading((prev) => ({ ...prev, [selectedEmail.id]: false }));
      setConfirmType(null);
    }
  }

  async function handleSend() {
    if (!selectedEmail) return;
    setActionLoading((prev) => ({ ...prev, [selectedEmail.id]: true }));
    try {
      const updated = await outreachApi.send(selectedEmail.id);
      const next = emails.map((e) => (e.id === selectedEmail.id ? updated : e));
      setEmails(next);
      onEmailsChange(prospect.id, next);
      showSnackbar({ message: `Email envoyé à ${prospect.emailContact}.`, severity: "success", duration: 6000 });
    } catch (err) {
      showSnackbar({
        message: err instanceof ApiError ? err.detail : "Erreur lors de l'envoi.",
        severity: "error",
      });
    } finally {
      setActionLoading((prev) => ({ ...prev, [selectedEmail!.id]: false }));
      setConfirmType(null);
    }
  }

  function handleConfirmStageChange(stage: PipelineStage) {
    onStageChange(prospect.id, stage);
    setConfirmType(null);
  }

  function enterEditMode() {
    if (!selectedEmail) return;
    setEditSubject(selectedEmail.sujet);
    setEditBody(selectedEmail.corps);
    setEditMode(true);
  }

  const isActionLoading = selectedEmail ? (actionLoading[selectedEmail.id] ?? false) : false;
  const isSentOrBeyond  = selectedEmail ? ["sent", "opened", "clicked"].includes(selectedEmail.statut) : false;
  const isValidated     = selectedEmail?.statut === "validated";
  const isDraft         = selectedEmail?.statut === "draft";

  // ── Render: loading ───────────────────────────────────────────────
  if (loadingEmails) {
    return (
      <Card elevation={0} variant="outlined" sx={{ borderRadius: 2.5, overflow: "hidden" }}>
        <Box sx={{ px: 2.5, pt: 2, pb: 1.5, borderBottom: 1, borderColor: "divider" }}>
          <Skeleton variant="text" width={280} sx={{ fontSize: "1.125rem" }} />
          <Skeleton variant="text" width={160} />
        </Box>
        <Box sx={{ p: 2.5, display: "flex", flexDirection: "column", gap: 1.5 }}>
          <Skeleton variant="rounded" height={36} sx={{ borderRadius: 2 }} />
          <Skeleton variant="rounded" height={220} sx={{ borderRadius: 2 }} />
        </Box>
      </Card>
    );
  }

  // ── Render: fetch error ───────────────────────────────────────────
  if (emailError) {
    return (
      <Card elevation={0} variant="outlined" sx={{ borderRadius: 2.5 }}>
        <Alert
          severity="error"
          action={<Button color="inherit" size="small" onClick={() => fetchEmails(prospect.id)}>Réessayer</Button>}
          sx={{ borderRadius: 2.5 }}
        >
          {emailError}
        </Alert>
      </Card>
    );
  }

  // ── Render: no emails yet ─────────────────────────────────────────
  if (j0Emails.length === 0) {
    const score = scoreTotal(prospect.score);
    return (
      <Card elevation={0} variant="outlined" sx={{ borderRadius: 2.5, overflow: "hidden" }}>
        <Box sx={{ px: 2.5, pt: 2, pb: 1.5, borderBottom: 1, borderColor: "divider" }}>
          <Typography variant="titleMedium" sx={{ fontWeight: 700, mb: 0.375 }}>
            Composer l&apos;email — {prospect.nom}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
            <Typography component="span" sx={{ fontSize: "1rem" }}>{LANGUAGE_FLAGS[prospect.langue]}</Typography>
            <Typography variant="labelMedium" color="text.secondary">
              Langue détectée :{" "}
              <Typography component="span" variant="labelMedium" sx={{ fontWeight: 700, color: "text.primary" }}>
                {LANG_LABELS[prospect.langue] ?? prospect.langue.toUpperCase()}
              </Typography>
            </Typography>
          </Box>
        </Box>
        <Box sx={{ p: 4, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, textAlign: "center" }}>
          <AutoAwesomeRoundedIcon sx={{ fontSize: 48, color: "primary.main", opacity: 0.7 }} />
          <Box>
            <Typography variant="titleSmall" sx={{ fontWeight: 700, mb: 0.5 }}>
              Aucun email généré pour {prospect.nom}
            </Typography>
            <Typography variant="bodySmall" color="text.secondary">
              {score >= 75
                ? "Ce prospect est qualifié. Générez les 3 variantes J0 (Direct, Bénéfices, Storytelling) via l'IA."
                : `Score ${score}/100 — sous le seuil de 75. La génération reste possible mais l'outreach n'est pas recommandé.`}
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={generating ? <CircularProgress size={16} color="inherit" /> : <AutoAwesomeRoundedIcon />}
            onClick={handleGenerate}
            disabled={generating}
            sx={{ fontWeight: 700, borderRadius: 2 }}
          >
            {generating ? "Génération en cours…" : "Générer les 3 variantes J0"}
          </Button>
        </Box>
      </Card>
    );
  }

  // ── Render: emails exist ──────────────────────────────────────────
  const displayEmail = editMode
    ? { sujet: editSubject, corps: editBody }
    : selectedEmail ?? { sujet: "", corps: "" };

  return (
    <>
      <Card elevation={0} variant="outlined" sx={{ borderRadius: 2.5, overflow: "hidden" }}>
        {/* Header */}
        <Box sx={{ px: 2.5, pt: 2, pb: 1.5, borderBottom: 1, borderColor: "divider" }}>
          <Typography variant="titleMedium" sx={{ fontWeight: 700, mb: 0.375 }}>
            Composer l&apos;email — {prospect.nom}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
            <Typography component="span" sx={{ fontSize: "1rem" }}>{LANGUAGE_FLAGS[prospect.langue]}</Typography>
            <Typography variant="labelMedium" color="text.secondary">
              Langue détectée automatiquement :{" "}
              <Typography component="span" variant="labelMedium" sx={{ fontWeight: 700, color: "text.primary" }}>
                {LANG_LABELS[prospect.langue] ?? prospect.langue.toUpperCase()}
              </Typography>
            </Typography>
          </Box>
        </Box>

        {/* Validation notice */}
        <Alert
          severity="warning"
          icon={<VerifiedRoundedIcon fontSize="small" />}
          sx={{ borderRadius: 0, "& .MuiAlert-message": { fontSize: "0.8125rem" } }}
        >
          <strong>Validation humaine requise (Spec §9)</strong> — L&apos;agent soumet l&apos;email mais ne l&apos;envoie pas sans approbation explicite.
        </Alert>

        {/* Recommendation banner */}
        {recommendation && (
          <Alert severity="info" sx={{ borderRadius: 0, py: 0.5, "& .MuiAlert-message": { fontSize: "0.75rem" } }}>
            {recommendation}
          </Alert>
        )}

        {/* Variant tabs */}
        <Tabs
          value={selectedVariant}
          onChange={(_, v: string) => setSelectedVariant(v)}
          sx={{ px: 2, borderBottom: 1, borderColor: "divider", minHeight: 44 }}
          TabIndicatorProps={{ style: { height: 3, borderRadius: "3px 3px 0 0" } }}
        >
          {j0Emails.map((e) => {
            const statusIcon =
              ["sent", "opened", "clicked"].includes(e.statut) ? (
                <MarkEmailReadRoundedIcon sx={{ fontSize: 12 }} />
              ) : e.statut === "validated" ? (
                <VerifiedRoundedIcon sx={{ fontSize: 12, color: "info.main" }} />
              ) : null;

            const chipColor =
              ["sent", "opened", "clicked"].includes(e.statut) ? "success" as const
              : e.statut === "validated" ? "info" as const
              : "warning" as const;

            const chipLabel =
              e.statut === "sent"      ? "Envoyé"
              : e.statut === "validated" ? "Validé"
              : e.statut === "opened"   ? "Ouvert"
              : e.statut === "clicked"  ? "Cliqué"
              : "Brouillon";

            return (
              <Tab
                key={e.variant}
                value={e.variant}
                label={
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    {e.variant === "A" ? "A — Direct" : e.variant === "B" ? "B — Bénéfices" : "C — Storytelling"}
                    {statusIcon}
                    <Chip
                      label={chipLabel}
                      color={chipColor}
                      size="small"
                      sx={{ height: 14, fontSize: "0.5rem", fontWeight: 700, "& .MuiChip-label": { px: 0.5 } }}
                    />
                  </Box>
                }
                sx={{ minHeight: 44, textTransform: "none", fontWeight: 600, fontSize: "0.8125rem" }}
              />
            );
          })}
        </Tabs>

        {/* Variant description */}
        <Box sx={{ px: 2.5, py: 0.875, bgcolor: "action.hover" }}>
          <Typography variant="bodySmall" color="text.secondary" sx={{ fontStyle: "italic" }}>
            {VARIANT_DESCS[selectedVariant]}
          </Typography>
        </Box>

        {/* Email content */}
        <Box sx={{ px: 2.5, pt: 2, pb: 1.5 }}>
          {editMode ? (
            <>
              <Alert severity="info" sx={{ mb: 1.5, borderRadius: 2, fontSize: "0.75rem" }}>
                Mode édition local — les modifications sont pour votre revue. Le backend conserve le texte généré.
              </Alert>
              <TextField
                label="Objet"
                size="small"
                fullWidth
                value={editSubject}
                onChange={(e) => setEditSubject(e.target.value)}
                sx={{ mb: 1.5 }}
              />
              <TextField
                label="Corps de l'email"
                multiline
                minRows={9}
                fullWidth
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                sx={{ "& .MuiInputBase-root": { fontFamily: "inherit", fontSize: "0.8125rem" } }}
              />
            </>
          ) : (
            <>
              <Typography variant="labelSmall" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                Objet
              </Typography>
              <Typography
                variant="bodyMedium"
                sx={{ fontWeight: 600, mb: 1.5, pb: 1.5, borderBottom: 1, borderColor: "divider" }}
              >
                {displayEmail.sujet}
              </Typography>
              <Box
                sx={{
                  whiteSpace: "pre-wrap",
                  fontFamily: "inherit",
                  fontSize: "0.8125rem",
                  lineHeight: 1.7,
                  color: "text.primary",
                  minHeight: 220,
                }}
              >
                {displayEmail.corps}
              </Box>

              {/* Sent date */}
              {isSentOrBeyond && selectedEmail?.date_envoi_reel && (
                <Typography variant="labelSmall" color="success.main" sx={{ mt: 1.5, display: "block", fontWeight: 700 }}>
                  ✓ Envoyé le{" "}
                  {new Date(selectedEmail.date_envoi_reel).toLocaleDateString("fr-FR", {
                    day: "numeric", month: "long", year: "numeric",
                  })}
                </Typography>
              )}
            </>
          )}
        </Box>

        {/* Action bar */}
        <Box
          sx={{
            px: 2.5, py: 1.5,
            borderTop: 1, borderColor: "divider",
            display: "flex", gap: 1, flexWrap: "wrap",
            justifyContent: "space-between", alignItems: "center",
          }}
        >
          <Button
            startIcon={editMode ? <VisibilityRoundedIcon /> : <EditRoundedIcon />}
            onClick={editMode ? () => setEditMode(false) : enterEditMode}
            variant="outlined"
            size="small"
            disabled={isSentOrBeyond}
            sx={{ fontWeight: 600, textTransform: "none" }}
          >
            {editMode ? "Aperçu" : "Modifier (local)"}
          </Button>

          <Box sx={{ display: "flex", gap: 1 }}>
            {isDraft && (
              <Button
                startIcon={isActionLoading ? <CircularProgress size={16} color="inherit" /> : <VerifiedRoundedIcon />}
                variant="contained"
                size="small"
                onClick={() => setConfirmType("validate")}
                disabled={isActionLoading || !selectedEmail}
                sx={{ fontWeight: 700, textTransform: "none" }}
              >
                {isActionLoading ? "Validation…" : "Soumettre pour validation"}
              </Button>
            )}
            {isValidated && (
              <Button
                startIcon={isActionLoading ? <CircularProgress size={16} color="inherit" /> : <SendRoundedIcon />}
                variant="contained"
                size="small"
                color="success"
                onClick={() => setConfirmType("send")}
                disabled={isActionLoading || !selectedEmail}
                sx={{ fontWeight: 700, textTransform: "none" }}
              >
                {isActionLoading ? "Envoi…" : "Envoyer"}
              </Button>
            )}
            {isSentOrBeyond && (
              <Chip
                icon={<MarkEmailReadRoundedIcon />}
                label="Email envoyé"
                color="success"
                size="small"
                sx={{ fontWeight: 700 }}
              />
            )}
          </Box>
        </Box>

        <Divider />

        {/* Stage transition actions */}
        <Box sx={{ px: 2.5, py: 1.5, display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Button
            startIcon={<ScheduleRoundedIcon />}
            variant="outlined"
            size="small"
            color="warning"
            sx={{ fontWeight: 600, textTransform: "none", fontSize: "0.75rem" }}
            onClick={() =>
              showSnackbar({
                message: `Relance J+3 planifiée pour ${addDays(prospect.dateAjout, 3)}`,
                severity: "success",
                duration: 4000,
              })
            }
          >
            Planifier relance J+3
          </Button>

          <Button
            startIcon={<TrendingUpRoundedIcon />}
            variant="outlined"
            size="small"
            color="secondary"
            sx={{ fontWeight: 600, textTransform: "none", fontSize: "0.75rem" }}
            onClick={() => setConfirmType("negociation")}
          >
            Passer en Négociation
          </Button>

          <Button
            startIcon={<PauseCircleRoundedIcon />}
            variant="outlined"
            size="small"
            sx={{ fontWeight: 600, textTransform: "none", fontSize: "0.75rem", color: "text.secondary", borderColor: "divider" }}
            onClick={() => setConfirmType("veille")}
          >
            Mettre en veille (J+30)
          </Button>
        </Box>
      </Card>

      {/* Dialogs */}
      <ConfirmationDialog
        open={confirmType === "validate"}
        onClose={() => setConfirmType(null)}
        onConfirm={handleValidate}
        title="Soumettre la variante pour validation"
        description={
          <Box>
            <Typography variant="bodyMedium" color="text.secondary" sx={{ mb: 1 }}>
              La variante <strong>{selectedEmail?.variant}</strong> sera marquée comme <em>validée</em>. Elle pourra ensuite être envoyée via le bouton « Envoyer ».
            </Typography>
            <Typography variant="bodySmall" color="warning.main" sx={{ fontWeight: 600 }}>
              Spec §9 — Toute validation engage la responsabilité humaine.
            </Typography>
          </Box>
        }
        confirmLabel="Valider"
      />

      <ConfirmationDialog
        open={confirmType === "send"}
        onClose={() => setConfirmType(null)}
        onConfirm={handleSend}
        title={`Envoyer l'email à ${prospect.emailContact} ?`}
        description={
          <Box>
            <Typography variant="bodyMedium" color="text.secondary" sx={{ mb: 1 }}>
              L&apos;email <strong>Variante {selectedEmail?.variant}</strong> sera envoyé à{" "}
              <strong>{prospect.emailContact}</strong> via Mailgun.
            </Typography>
            <Typography variant="bodySmall" color="warning.main" sx={{ fontWeight: 600 }}>
              Cette action est définitive.
            </Typography>
          </Box>
        }
        confirmLabel="Envoyer"
      />

      <ConfirmationDialog
        open={confirmType === "negociation"}
        onClose={() => setConfirmType(null)}
        onConfirm={() => handleConfirmStageChange("negociation")}
        title="Passer en Négociation ?"
        description={`${prospect.nom} sera déplacé dans l'étape Négociation. Cette action est réversible depuis le pipeline Kanban.`}
        confirmLabel="Passer en Négociation"
      />

      <ConfirmationDialog
        open={confirmType === "veille"}
        onClose={() => setConfirmType(null)}
        onConfirm={() => handleConfirmStageChange("veille")}
        title="Mettre en veille ?"
        description={`${prospect.nom} sera mis en veille jusqu'à J+30 (${addDays(prospect.dateAjout, 30)}). Une réactivation saisonnière sera proposée automatiquement.`}
        confirmLabel="Mettre en veille"
        confirmColor="warning"
      />
    </>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function ComposerEmptyState() {
  const theme = useTheme();
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        minHeight: 320,
        gap: 2,
        borderRadius: 2.5,
        border: `2px dashed ${theme.palette.divider}`,
        color: "text.disabled",
      }}
    >
      <MarkEmailReadRoundedIcon sx={{ fontSize: 48, opacity: 0.4 }} />
      <Typography variant="titleSmall" color="text.disabled">
        Sélectionnez un prospect pour composer l&apos;email
      </Typography>
    </Box>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OutreachPage() {
  const { showSnackbar } = useSnackbar();
  const TODAY = new Date().toISOString().split("T")[0];

  const [prospects, setProspects]       = useState<Prospect[]>([]);
  const [loading, setLoading]           = useState(true);
  const [fetchError, setFetchError]     = useState<string | null>(null);
  const [selectedId, setSelectedId]     = useState<string | null>(null);

  // Per-prospect emails cache (populated by EmailComposer when it fetches)
  const [emailsCache, setEmailsCache]   = useState<Record<string, RawOutreachEmail[]>>({});

  async function fetchProspects() {
    setLoading(true);
    setFetchError(null);
    try {
      const result = await prospectsApi.list({ stage: "outreach", pageSize: 100 });
      setProspects(result.items);
    } catch (err) {
      setFetchError(err instanceof ApiError ? err.detail : "Impossible de charger les prospects.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchProspects(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-select first prospect
  useEffect(() => {
    if (!selectedId && prospects.length > 0) setSelectedId(prospects[0].id);
  }, [prospects, selectedId]);

  const selectedProspect = useMemo(
    () => prospects.find((p) => p.id === selectedId) ?? null,
    [selectedId, prospects],
  );

  // Called by EmailComposer when it fetches or updates emails — updates the card timeline
  const handleEmailsChange = useCallback((prospectId: string, emails: RawOutreachEmail[]) => {
    setEmailsCache((prev) => ({ ...prev, [prospectId]: emails }));
  }, []);

  const handleStageChange = useCallback(
    async (id: string, newStage: PipelineStage) => {
      const previous = prospects.find((p) => p.id === id);
      if (!previous) return;
      // Optimistic: remove from list immediately
      setProspects((prev) => prev.filter((p) => p.id !== id));
      setSelectedId(null);
      try {
        await prospectsApi.patchStage(id, newStage);
        showSnackbar({
          message: `${previous.nom} → ${STAGE_LABELS[newStage]}`,
          severity: "success",
          duration: 5000,
          action: (
            <Button
              color="inherit"
              size="small"
              onClick={async () => {
                await prospectsApi.patchStage(id, previous.stage);
                setProspects((prev) => [previous, ...prev]);
                setSelectedId(id);
              }}
            >
              Annuler
            </Button>
          ),
        });
      } catch (err) {
        // Rollback
        setProspects((prev) => [previous, ...prev]);
        showSnackbar({
          message: err instanceof ApiError ? err.detail : "Erreur lors du changement d'étape.",
          severity: "error",
        });
      }
    },
    [prospects, showSnackbar],
  );

  // j7 counter: prospects whose dateAjout + 7 days has passed
  const j7Count = useMemo(
    () => prospects.filter((p) => addDays(p.dateAjout, 7) <= TODAY).length,
    [prospects, TODAY],
  );

  // Emails awaiting validation across the cache
  const pendingValidation = useMemo(
    () =>
      Object.values(emailsCache)
        .flat()
        .filter((e) => e.statut === "draft").length,
    [emailsCache],
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      {/* Page header */}
      <Box sx={{ px: { xs: 2, sm: 3, md: 4 }, pt: { xs: 2, md: 3 }, pb: 2 }}>
        <Typography variant="headlineMedium" component="h1" sx={{ mb: 0.5 }}>
          Outreach
        </Typography>
        <Typography variant="bodyMedium" color="text.secondary" sx={{ mb: 2 }}>
          Séquences J0 → J+3 → J+7 → J+30 · Validation humaine requise avant tout envoi (Spec §9)
        </Typography>

        {loading ? (
          <Box sx={{ display: "flex", gap: 1 }}>
            {[100, 120, 140].map((w) => (
              <Skeleton key={w} variant="rounded" width={w} height={30} sx={{ borderRadius: 4 }} />
            ))}
          </Box>
        ) : (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
            {[
              { label: "Séquences actives",     value: prospects.length,   color: "warning" as const },
              { label: "Relances J+7 dues",      value: j7Count,            color: j7Count > 0 ? "error" as const : "default" as const },
              { label: "En attente validation",  value: pendingValidation,  color: "info" as const },
            ].map((s) => (
              <Chip
                key={s.label}
                label={
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    <Typography component="span" sx={{ fontWeight: 800, fontSize: "0.875rem", lineHeight: 1 }}>
                      {s.value}
                    </Typography>
                    <Typography component="span" sx={{ fontSize: "0.75rem", opacity: 0.85 }}>
                      {s.label}
                    </Typography>
                  </Box>
                }
                color={s.color}
                variant="outlined"
                sx={{ height: 30, "& .MuiChip-label": { px: 1.25 } }}
              />
            ))}
          </Box>
        )}
      </Box>

      <Divider />

      {/* Error banner */}
      {fetchError && (
        <Box sx={{ px: { xs: 2, md: 4 }, pt: 2 }}>
          <Alert
            severity="error"
            action={<Button color="inherit" size="small" onClick={fetchProspects}>Réessayer</Button>}
            sx={{ borderRadius: 2 }}
          >
            {fetchError}
          </Alert>
        </Box>
      )}

      {/* Main 2-panel layout */}
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", md: "row" },
          gap: 2,
          flex: 1,
          px: { xs: 2, md: 4 },
          py: 2,
        }}
      >
        {/* Left: prospect list */}
        <Box
          sx={{
            width: { md: 360 },
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            gap: 1.5,
          }}
        >
          {loading ? (
            [1, 2, 3].map((i) => (
              <Skeleton key={i} variant="rounded" height={120} sx={{ borderRadius: 2.5 }} />
            ))
          ) : prospects.length === 0 ? (
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", py: 6, gap: 1, color: "text.disabled" }}>
              <InboxRoundedIcon sx={{ fontSize: 40 }} />
              <Typography variant="bodyMedium">Aucun prospect en outreach</Typography>
            </Box>
          ) : (
            prospects.map((p) => (
              <OutreachProspectCard
                key={p.id}
                prospect={p}
                emails={emailsCache[p.id] ?? []}
                selected={selectedId === p.id}
                onSelect={() => setSelectedId(p.id)}
              />
            ))
          )}
        </Box>

        {/* Right: email composer */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {selectedProspect ? (
            <EmailComposer
              prospect={selectedProspect}
              onStageChange={handleStageChange}
              onEmailsChange={handleEmailsChange}
            />
          ) : (
            !loading && <ComposerEmptyState />
          )}
        </Box>
      </Box>
    </Box>
  );
}
