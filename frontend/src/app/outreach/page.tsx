"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
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
import Tooltip from "@mui/material/Tooltip";
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

import mockProspects from "@/data/mockProspects";
import type { Prospect, PipelineStage } from "@/types/prospect";
import { scoreTotal, scoreColor, PARTNER_TYPE_LABELS, STAGE_LABELS, LANGUAGE_FLAGS } from "@/types/prospect";
import { useSnackbar } from "@/contexts/SnackbarContext";
import ConfirmationDialog from "@/components/shared/ConfirmationDialog";

// ─── Constants ────────────────────────────────────────────────────────────────

const TODAY = "2026-06-24";

const LANG_LABELS: Record<string, string> = {
  fr: "Français",
  en: "English",
  es: "Español",
  de: "Deutsch",
  ar: "العربية",
};

// ─── Sequence helpers ─────────────────────────────────────────────────────────

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function parseJ0Date(p: Prospect): string {
  const match = p.notes?.match(/J0 envoyé (\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? p.dateAjout;
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

function computeSequence(j0Date: string): SequenceStep[] {
  const steps = SEQ_CONFIG.map(({ key, offset, label, desc }) => ({
    key,
    label,
    desc,
    date: addDays(j0Date, offset),
    status: "upcoming" as SequenceStep["status"],
  }));
  const currentIdx = steps.findIndex((s) => s.date >= TODAY);
  const ci = currentIdx === -1 ? steps.length : currentIdx;
  return steps.map((s, i) => ({
    ...s,
    status: i < ci ? "done" : i === ci ? "current" : "upcoming",
  }));
}

// ─── Email template generator ─────────────────────────────────────────────────

function generateEmail(p: Prospect, variant: number): { subject: string; body: string } {
  const firstName = p.nomContact.split(" ")[0];

  const productRef =
    p.type === "hotel_riad" || p.type === "hotel_luxe"
      ? "votre établissement"
      : p.type === "prestataire_activites"
      ? "vos activités"
      : p.type === "mice"
      ? "vos offres MICE & Incentive"
      : p.type === "transport"
      ? "vos services de transfert"
      : "votre catalogue";

  const templates = [
    // Variant A: Direct
    {
      subject: `Partenariat distribution OTA — ${p.nom}`,
      body: `Bonjour ${firstName},

Je me permets de vous contacter au nom de Bab Morocco, une OTA 100% dédiée à la découverte du Maroc, actuellement en phase de lancement.

${p.nom} figure parmi les prestataires sélectionnés pour notre catalogue inaugural, et nous souhaitons vous proposer un partenariat de distribution.

Notre proposition :
• Distribution sur les marchés européens (France, UK, Allemagne) et du Golfe (EAU, Arabie Saoudite)
• Commission de ${p.commissionStandard}% sur les réservations confirmées, paiement garanti sous 45 jours
• Badge « Partenaire Fondateur » — visibilité prioritaire dès le lancement

Seriez-vous disponible pour un échange de 20 minutes la semaine prochaine ?

Bien cordialement,
Équipe Partenariats | Bab Morocco
partenariats@babmorocco.com`,
    },
    // Variant B: Bénéfices
    {
      subject: `${p.nom} × Bab Morocco — 3 bénéfices concrets`,
      body: `Bonjour ${firstName},

Voici pourquoi les meilleurs prestataires marocains rejoignent Bab Morocco :

✓ Nouveaux marchés — Accès direct aux voyageurs premium d'Europe et du Golfe, des segments que les OTAs généralistes sous-exploitent pour le Maroc.

✓ Commission prévisible — ${p.commissionStandard}% sur les réservations confirmées uniquement, paiement sous 45 jours, reporting mensuel détaillé.

✓ Visibilité Fondateur — ${p.nom} serait parmi les premiers référencés. Au lancement, nos partenaires fondateurs bénéficient d'une mise en avant via notre newsletter (50 000 contacts cibles) et nos réseaux sociaux.

${p.nom} correspond exactement à notre positionnement qualitatif pour ${p.ville}.

Un appel de 20 min pour avancer ensemble ?
📅 [Lien de réservation de créneau]

Bien à vous,
Équipe Partenariats | Bab Morocco`,
    },
    // Variant C: Storytelling
    {
      subject: `Ce voyageur cherche ${productRef}. Voilà comment l'atteindre.`,
      body: `Bonjour ${firstName},

Permettez-moi de vous décrire un voyageur type :

Il prépare son voyage au Maroc depuis des semaines. Il veut l'authentique, l'inoubliable — pas le circuit standard. Il cherche des recommandations fiables, pas un algorithme généraliste.

Ce voyageur est français, britannique, émirati. Et il est de plus en plus nombreux à chercher ce que ${p.nom} propose à ${p.ville}.

Bab Morocco a été conçu pour lui. Une seule destination — le Maroc — avec l'expertise et la curation qu'elle mérite.

Nous ouvrons notre catalogue de lancement. ${p.nom} a toute sa place dans cette sélection.

20 minutes pour en parler cette semaine ?

Avec enthousiasme,
Équipe Partenariats | Bab Morocco
partenariats@babmorocco.com`,
    },
  ];

  return templates[variant] ?? templates[0];
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
  selected,
  onSelect,
}: {
  prospect: Prospect;
  selected: boolean;
  onSelect: () => void;
}) {
  const theme = useTheme();
  const steps = computeSequence(parseJ0Date(prospect));
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
}: {
  prospect: Prospect;
  onStageChange: (id: string, stage: PipelineStage) => void;
}) {
  const { showSnackbar } = useSnackbar();
  const [tab, setTab] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [confirmType, setConfirmType] = useState<"send" | "negociation" | "veille" | null>(null);

  const generated = useMemo(() => generateEmail(prospect, tab), [prospect, tab]);

  useEffect(() => {
    setEditMode(false);
  }, [tab, prospect.id]);

  const currentEmail = editMode ? { subject: editSubject, body: editBody } : generated;

  function enterEditMode() {
    setEditSubject(generated.subject);
    setEditBody(generated.body);
    setEditMode(true);
  }

  function handleConfirm() {
    if (confirmType === "send") {
      showSnackbar({ message: "Email soumis — validation humaine requise avant envoi", severity: "info", duration: 5000 });
    } else if (confirmType === "negociation") {
      onStageChange(prospect.id, "negociation");
    } else if (confirmType === "veille") {
      onStageChange(prospect.id, "veille");
    }
    setConfirmType(null);
  }

  const variantDescs = [
    "A — Direct : approche professionnelle concise avec proposition commerciale claire",
    "B — Bénéfices : 3 bénéfices concrets mis en avant pour maximiser l'impact",
    "C — Storytelling : narration émotionnelle autour du voyageur idéal",
  ];

  return (
    <>
      <Card elevation={0} variant="outlined" sx={{ borderRadius: 2.5, overflow: "hidden" }}>
        {/* Header */}
        <Box sx={{ px: 2.5, pt: 2, pb: 1.5, borderBottom: 1, borderColor: "divider" }}>
          <Typography variant="titleMedium" sx={{ fontWeight: 700, mb: 0.375 }}>
            Composer l&apos;email — {prospect.nom}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
            <Typography component="span" sx={{ fontSize: "1rem" }}>
              {LANGUAGE_FLAGS[prospect.langue]}
            </Typography>
            <Typography variant="labelMedium" color="text.secondary">
              Langue détectée automatiquement :{" "}
              <Typography component="span" variant="labelMedium" sx={{ fontWeight: 700, color: "text.primary" }}>
                {LANG_LABELS[prospect.langue] ?? prospect.langue.toUpperCase()}
              </Typography>
            </Typography>
          </Box>
        </Box>

        {/* Human-validation notice */}
        <Alert
          severity="warning"
          icon={<VerifiedRoundedIcon fontSize="small" />}
          sx={{ borderRadius: 0, "& .MuiAlert-message": { fontSize: "0.8125rem" } }}
        >
          <strong>Validation humaine requise (Spec §9)</strong> — L&apos;agent soumet l&apos;email mais ne l&apos;envoie pas sans approbation explicite.
        </Alert>

        {/* Variant tabs */}
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v as number)}
          sx={{ px: 2, borderBottom: 1, borderColor: "divider", minHeight: 44 }}
          TabIndicatorProps={{ style: { height: 3, borderRadius: "3px 3px 0 0" } }}
        >
          {["A — Direct", "B — Bénéfices", "C — Storytelling"].map((label, i) => (
            <Tab
              key={i}
              label={label}
              sx={{ minHeight: 44, textTransform: "none", fontWeight: 600, fontSize: "0.8125rem" }}
            />
          ))}
        </Tabs>

        {/* Variant description */}
        <Box sx={{ px: 2.5, py: 0.875, bgcolor: "action.hover" }}>
          <Typography variant="bodySmall" color="text.secondary" sx={{ fontStyle: "italic" }}>
            {variantDescs[tab]}
          </Typography>
        </Box>

        {/* Email content */}
        <Box sx={{ px: 2.5, pt: 2, pb: 1.5 }}>
          {editMode ? (
            <>
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
                {currentEmail.subject}
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
                {currentEmail.body}
              </Box>
            </>
          )}
        </Box>

        {/* Action bar */}
        <Box
          sx={{
            px: 2.5,
            py: 1.5,
            borderTop: 1,
            borderColor: "divider",
            display: "flex",
            gap: 1,
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Button
            startIcon={editMode ? <VisibilityRoundedIcon /> : <EditRoundedIcon />}
            onClick={editMode ? () => setEditMode(false) : enterEditMode}
            variant="outlined"
            size="small"
            sx={{ fontWeight: 600, textTransform: "none" }}
          >
            {editMode ? "Aperçu" : "Modifier"}
          </Button>

          <Button
            startIcon={<VerifiedRoundedIcon />}
            variant="contained"
            size="small"
            onClick={() => setConfirmType("send")}
            sx={{ fontWeight: 700, textTransform: "none" }}
          >
            Soumettre pour validation
          </Button>
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
                message: `Relance J+3 planifiée — ${addDays(parseJ0Date(prospect), 3)}`,
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
            sx={{
              fontWeight: 600,
              textTransform: "none",
              fontSize: "0.75rem",
              color: "text.secondary",
              borderColor: "divider",
            }}
            onClick={() => setConfirmType("veille")}
          >
            Mettre en veille (J+30)
          </Button>
        </Box>
      </Card>

      <ConfirmationDialog
        open={confirmType === "send"}
        onClose={() => setConfirmType(null)}
        onConfirm={handleConfirm}
        title="Soumettre l'email pour validation"
        description={
          <Box>
            <Typography variant="bodyMedium" color="text.secondary" sx={{ mb: 1 }}>
              L&apos;email sera soumis à l&apos;équipe commerciale pour révision et approbation avant envoi effectif.
            </Typography>
            <Typography variant="bodySmall" color="warning.main" sx={{ fontWeight: 600 }}>
              Spec §9 — L&apos;agent ne peut jamais envoyer sans validation humaine explicite.
            </Typography>
          </Box>
        }
        confirmLabel="Soumettre"
      />

      <ConfirmationDialog
        open={confirmType === "negociation"}
        onClose={() => setConfirmType(null)}
        onConfirm={handleConfirm}
        title="Passer en Négociation ?"
        description={`${prospect.nom} sera déplacé dans l'étape Négociation. Cette action est réversible depuis le pipeline Kanban.`}
        confirmLabel="Passer en Négociation"
      />

      <ConfirmationDialog
        open={confirmType === "veille"}
        onClose={() => setConfirmType(null)}
        onConfirm={handleConfirm}
        title="Mettre en veille ?"
        description={`${prospect.nom} sera mis en veille jusqu'à J+30 (${addDays(parseJ0Date(prospect), 30)}). Une réactivation saisonnière sera proposée automatiquement.`}
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
  const [allProspects, setAllProspects] = useState(mockProspects);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const outreachProspects = useMemo(
    () => allProspects.filter((p) => p.stage === "outreach"),
    [allProspects]
  );

  const selectedProspect = useMemo(
    () => (selectedId ? outreachProspects.find((p) => p.id === selectedId) ?? null : null),
    [selectedId, outreachProspects]
  );

  // Auto-select the first prospect
  useEffect(() => {
    if (!selectedId && outreachProspects.length > 0) {
      setSelectedId(outreachProspects[0].id);
    }
  }, [outreachProspects, selectedId]);

  const handleStageChange = useCallback(
    (id: string, newStage: PipelineStage) => {
      const previous = allProspects.find((p) => p.id === id);
      if (!previous) return;
      setAllProspects((prev) => prev.map((p) => (p.id === id ? { ...p, stage: newStage } : p)));
      setSelectedId(null);
      showSnackbar({
        message: `${previous.nom} → ${STAGE_LABELS[newStage]}`,
        severity: "success",
        duration: 5000,
        action: (
          <Button
            color="inherit"
            size="small"
            onClick={() => {
              setAllProspects((prev) => prev.map((p) => (p.id === id ? { ...p, stage: previous.stage } : p)));
              setSelectedId(id);
            }}
          >
            Annuler
          </Button>
        ),
      });
    },
    [allProspects, showSnackbar]
  );

  const j7Count = useMemo(
    () => outreachProspects.filter((p) => addDays(parseJ0Date(p), 7) <= TODAY).length,
    [outreachProspects]
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

        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
          {[
            { label: "Séquences actives", value: outreachProspects.length, color: "warning" as const },
            { label: "Relances J+7 dues", value: j7Count, color: j7Count > 0 ? ("error" as const) : ("default" as const) },
            { label: "En attente validation", value: outreachProspects.length, color: "info" as const },
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
      </Box>

      <Divider />

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
          {outreachProspects.length === 0 ? (
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", py: 6, gap: 1, color: "text.disabled" }}>
              <InboxRoundedIcon sx={{ fontSize: 40 }} />
              <Typography variant="bodyMedium">Aucun prospect en outreach</Typography>
            </Box>
          ) : (
            outreachProspects.map((p) => (
              <OutreachProspectCard
                key={p.id}
                prospect={p}
                selected={selectedId === p.id}
                onSelect={() => setSelectedId(p.id)}
              />
            ))
          )}
        </Box>

        {/* Right: email composer */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {selectedProspect ? (
            <EmailComposer prospect={selectedProspect} onStageChange={handleStageChange} />
          ) : (
            <ComposerEmptyState />
          )}
        </Box>
      </Box>
    </Box>
  );
}
