"use client";

import React, { useState, useCallback } from "react";
import Link from "next/link";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardActionArea from "@mui/material/CardActionArea";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Tooltip from "@mui/material/Tooltip";
import IconButton from "@mui/material/IconButton";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import { alpha, useTheme } from "@mui/material/styles";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import HourglassTopRoundedIcon from "@mui/icons-material/HourglassTopRounded";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import CloudDoneRoundedIcon from "@mui/icons-material/CloudDoneRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import PictureAsPdfRoundedIcon from "@mui/icons-material/PictureAsPdfRounded";
import DrawRoundedIcon from "@mui/icons-material/DrawRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import LockClockRoundedIcon from "@mui/icons-material/LockClockRounded";

import mockProspects from "@/data/mockProspects";
import type { Prospect } from "@/types/prospect";
import { PARTNER_TYPE_LABELS, STAGE_LABELS, LANGUAGE_FLAGS } from "@/types/prospect";
import ProspectDrawer from "@/components/crm/ProspectDrawer";
import { useSnackbar } from "@/contexts/SnackbarContext";

// ─── Contract status logic ────────────────────────────────────────────────

type ContractStatus = "draft" | "generated" | "sent_yousign" | "signed_active";

interface ContractInfo {
  status: ContractStatus;
  label: string;
  description: string;
  chipColor: "default" | "info" | "warning" | "success" | "error";
  icon: React.ReactNode;
  webhookFired?: boolean;
  webhookDate?: string;
  signedDate?: string;
}

function deriveContractInfo(p: Prospect): ContractInfo {
  const notes = p.notes ?? "";

  if (p.stage === "activation_ota") {
    const webhookMatch = notes.match(/depuis (\d{4}-\d{2}-\d{2})/);
    const signedMatch  = notes.match(/Signé (\d{4}-\d{2}-\d{2})/);
    return {
      status: "signed_active",
      label: "Signé & actif",
      description: "Contrat signé · Partenaire actif sur babmorocco.com",
      chipColor: "success",
      icon: <CheckCircleRoundedIcon fontSize="small" />,
      webhookFired: notes.includes("Webhook"),
      webhookDate: webhookMatch?.[1],
      signedDate: signedMatch?.[1],
    };
  }

  if (notes.includes("YouSign")) {
    return {
      status: "sent_yousign",
      label: "En attente signature",
      description: "Contrat envoyé via YouSign · Relance possible",
      chipColor: "warning",
      icon: <HourglassTopRoundedIcon fontSize="small" />,
    };
  }

  if (notes.includes("Contrat généré") || notes.includes("Accord verbal")) {
    return {
      status: "generated",
      label: "Contrat généré",
      description: "Draft prêt · En attente envoi YouSign",
      chipColor: "info",
      icon: <DescriptionOutlinedIcon fontSize="small" />,
    };
  }

  return {
    status: "draft",
    label: "À préparer",
    description: "Accord en cours · Contrat non encore généré",
    chipColor: "default",
    icon: <DrawRoundedIcon fontSize="small" />,
  };
}

// ─── Contracts derived from mockProspects ────────────────────────────────

const CONTRACT_STAGES = ["closing", "activation_ota"] as const;
const contractProspects = mockProspects
  .filter((p) => (CONTRACT_STAGES as readonly string[]).includes(p.stage))
  .sort((a, b) => {
    const order = { activation_ota: 0, closing: 1 };
    return (order[a.stage as keyof typeof order] ?? 2) - (order[b.stage as keyof typeof order] ?? 2);
  });

const closingCount    = contractProspects.filter((p) => p.stage === "closing").length;
const activatedCount  = contractProspects.filter((p) => p.stage === "activation_ota").length;
const avgCommission   = Math.round(
  contractProspects.reduce((s, p) => s + p.commissionStandard, 0) / (contractProspects.length || 1)
);

// ─── Phase 2 Dialog ───────────────────────────────────────────────────────

function Phase2Dialog({ open, onClose, prospect }: { open: boolean; onClose: () => void; prospect: Prospect | null }) {
  if (!prospect) return null;
  const info = deriveContractInfo(prospect);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1.5, pb: 1 }}>
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: 2,
            bgcolor: alpha("#B5451B", 0.1),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <PictureAsPdfRoundedIcon sx={{ color: "primary.main", fontSize: 20 }} />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="titleMedium" sx={{ fontWeight: 700 }}>
            Génération de contrat
          </Typography>
          <Typography variant="bodySmall" color="text.secondary">
            {prospect.nom}
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent>
        <Alert severity="info" icon={<LockClockRoundedIcon />} sx={{ mb: 2, borderRadius: 2 }}>
          <Typography variant="bodySmall" sx={{ fontWeight: 700 }}>
            Fonctionnalité Phase 2
          </Typography>
          <Typography variant="bodySmall" sx={{ display: "block", mt: 0.25 }}>
            La génération PDF (ReportLab) et la signature électronique YouSign (EIDAS) sont
            planifiées pour la Phase 2 (J60–J120). Le connecteur OTA webhook sera activé
            automatiquement après signature.
          </Typography>
        </Alert>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          <Typography variant="titleSmall" sx={{ fontWeight: 700 }}>
            Structure du contrat standard
          </Typography>
          {[
            "Parties contractantes + coordonnées",
            "Objet du partenariat et périmètre",
            `Commission ${prospect.commissionStandard}% · paiement sous 45 jours`,
            "Obligations Bab Morocco (visibilité, tracking, reporting mensuel)",
            "Obligations partenaire (tarifs à jour, qualité de service)",
            "Durée 12 mois · renouvellement tacite · préavis 30 jours",
            "Confidentialité et propriété intellectuelle",
            "Conformité RGPD / PDPL selon zone",
            "Juridiction et droit applicable",
          ].map((clause, i) => (
            <Box key={i} sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
              <Typography
                sx={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  bgcolor: "primary.main",
                  color: "primary.contrastText",
                  fontSize: "0.6875rem",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  mt: "2px",
                }}
                component="span"
              >
                {i + 1}
              </Typography>
              <Typography variant="bodySmall">{clause}</Typography>
            </Box>
          ))}
        </Box>

        <Divider sx={{ my: 2 }} />

        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Chip label={`Statut actuel : ${info.label}`} color={info.chipColor} size="small" />
          <Chip label={`Commission : ${prospect.commissionStandard}%`} color="primary" variant="outlined" size="small" />
          <Chip label={`Plancher : ${prospect.commissionPlancher}%`} color="default" variant="outlined" size="small" />
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <Button onClick={onClose} variant="text">Fermer</Button>
        <Tooltip title="Disponible en Phase 2">
          <span>
            <Button
              variant="contained"
              startIcon={<PictureAsPdfRoundedIcon />}
              disabled
              disableElevation
            >
              Générer le PDF
            </Button>
          </span>
        </Tooltip>
      </DialogActions>
    </Dialog>
  );
}

// ─── Contract Card ────────────────────────────────────────────────────────

function ContractCard({
  prospect,
  onOpenFiche,
  onOpenContract,
}: {
  prospect: Prospect;
  onOpenFiche: (p: Prospect) => void;
  onOpenContract: (p: Prospect) => void;
}) {
  const theme = useTheme();
  const info = deriveContractInfo(prospect);
  const isHumanRequired = prospect.notes?.includes("VALIDATION HUMAINE REQUISE") ?? false;

  const accentColor =
    info.status === "signed_active"
      ? theme.palette.success.main
      : info.status === "sent_yousign"
      ? theme.palette.warning.main
      : info.status === "generated"
      ? theme.palette.info.main
      : theme.palette.text.disabled;

  return (
    <Card
      elevation={0}
      variant="outlined"
      sx={{
        borderRadius: 3,
        overflow: "hidden",
        borderColor: info.status === "signed_active" ? alpha(theme.palette.success.main, 0.4) : "divider",
      }}
    >
      {/* Status accent strip */}
      <Box sx={{ height: 4, bgcolor: accentColor }} />

      <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>

        {/* Header row */}
        <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5, mb: 1.5 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", mb: 0.5 }}>
              <Typography variant="titleSmall" sx={{ fontWeight: 700 }}>
                {prospect.nom}
              </Typography>
              <Chip
                icon={info.icon as React.ReactElement}
                label={info.label}
                color={info.chipColor}
                size="small"
                sx={{ fontWeight: 700, fontSize: "0.6875rem" }}
              />
              {isHumanRequired && (
                <Chip
                  icon={<WarningAmberRoundedIcon sx={{ fontSize: "14px !important" }} />}
                  label="Validation humaine"
                  color="error"
                  size="small"
                  variant="outlined"
                  sx={{ fontWeight: 700, fontSize: "0.6875rem" }}
                />
              )}
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
              <Chip
                label={PARTNER_TYPE_LABELS[prospect.type]}
                size="small"
                sx={{ height: 18, fontSize: "0.625rem", "& .MuiChip-label": { px: 0.75 } }}
              />
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <PlaceOutlinedIcon sx={{ fontSize: 12, color: "text.secondary" }} />
                <Typography variant="bodySmall" color="text.secondary" sx={{ fontSize: "0.75rem" }}>
                  {prospect.ville}, {prospect.pays}
                </Typography>
              </Box>
              <Typography component="span" sx={{ fontSize: "0.875rem" }}>
                {LANGUAGE_FLAGS[prospect.langue]}
              </Typography>
            </Box>
          </Box>

          {/* Commission block */}
          <Box sx={{ textAlign: "right", flexShrink: 0 }}>
            <Typography sx={{ fontSize: "1.5rem", fontWeight: 800, lineHeight: 1, color: "primary.main" }}>
              {prospect.commissionStandard}%
            </Typography>
            <Typography variant="labelSmall" color="text.secondary">
              plancher {prospect.commissionPlancher}%
            </Typography>
          </Box>
        </Box>

        <Divider sx={{ mb: 1.5 }} />

        {/* Status description */}
        <Typography variant="bodySmall" color="text.secondary" sx={{ mb: 1.5 }}>
          {info.description}
        </Typography>

        {/* Webhook status for active partners */}
        {info.status === "signed_active" && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              p: 1.25,
              borderRadius: 2,
              bgcolor: alpha(theme.palette.success.main, 0.07),
              border: `1px solid ${alpha(theme.palette.success.main, 0.2)}`,
              mb: 1.5,
            }}
          >
            <CloudDoneRoundedIcon sx={{ color: "success.main", fontSize: 18, flexShrink: 0 }} />
            <Box sx={{ flex: 1 }}>
              <Typography variant="labelSmall" sx={{ fontWeight: 700, color: "success.main", display: "block" }}>
                Webhook OTA déclenché ✓
              </Typography>
              <Typography variant="bodySmall" color="text.secondary" sx={{ fontSize: "0.6875rem" }}>
                {info.signedDate && `Signé le ${info.signedDate}`}
                {info.webhookDate && ` · Actif depuis le ${info.webhookDate}`}
              </Typography>
            </Box>
            <Chip
              label="Actif babmorocco.com"
              color="success"
              size="small"
              sx={{ fontWeight: 700, fontSize: "0.625rem", "& .MuiChip-label": { px: 0.75 } }}
            />
          </Box>
        )}

        {/* YouSign pending relance for sent contracts */}
        {info.status === "sent_yousign" && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              p: 1.25,
              borderRadius: 2,
              bgcolor: alpha(theme.palette.warning.main, 0.07),
              border: `1px solid ${alpha(theme.palette.warning.main, 0.2)}`,
              mb: 1.5,
            }}
          >
            <SendRoundedIcon sx={{ color: "warning.main", fontSize: 18, flexShrink: 0 }} />
            <Box>
              <Typography variant="labelSmall" sx={{ fontWeight: 700, color: "warning.main", display: "block" }}>
                YouSign · En attente de signature
              </Typography>
              <Typography variant="bodySmall" color="text.secondary" sx={{ fontSize: "0.6875rem" }}>
                {prospect.dateProchainContact
                  ? `Relance prévue le ${prospect.dateProchainContact}`
                  : "Surveiller la boîte de réception"}
              </Typography>
            </Box>
          </Box>
        )}

        {/* Notes excerpt */}
        {prospect.notes && (
          <Typography
            variant="bodySmall"
            color="text.secondary"
            sx={{
              fontSize: "0.6875rem",
              mb: 1.5,
              fontStyle: "italic",
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            {prospect.notes}
          </Typography>
        )}

        {/* Actions row */}
        <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
          <Button
            size="small"
            variant="outlined"
            endIcon={<ChevronRightRoundedIcon />}
            onClick={() => onOpenFiche(prospect)}
            sx={{ fontWeight: 600, textTransform: "none", borderRadius: 2 }}
          >
            Voir la fiche
          </Button>

          {info.status !== "signed_active" && (
            <Tooltip
              title={
                info.status === "sent_yousign"
                  ? "Relancer via YouSign — Phase 2"
                  : "Générer le contrat PDF — Phase 2"
              }
            >
              <span>
                <Button
                  size="small"
                  variant="contained"
                  disableElevation
                  startIcon={
                    info.status === "sent_yousign" ? (
                      <SendRoundedIcon />
                    ) : (
                      <PictureAsPdfRoundedIcon />
                    )
                  }
                  onClick={() => onOpenContract(prospect)}
                  sx={{ fontWeight: 600, textTransform: "none", borderRadius: 2 }}
                >
                  {info.status === "sent_yousign" ? "Relancer YouSign" : "Générer contrat"}
                </Button>
              </span>
            </Tooltip>
          )}

          {info.status === "signed_active" && prospect.adresseWeb && (
            <Button
              size="small"
              variant="text"
              endIcon={<OpenInNewRoundedIcon sx={{ fontSize: 14 }} />}
              href={
                prospect.adresseWeb.startsWith("http")
                  ? prospect.adresseWeb
                  : `https://${prospect.adresseWeb}`
              }
              target="_blank"
              rel="noopener noreferrer"
              sx={{ fontWeight: 600, textTransform: "none" }}
            >
              Voir le site
            </Button>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function ContratsPage() {
  const theme = useTheme();
  const { showSnackbar } = useSnackbar();

  // Local state for the prospects (allows stage/notes changes from drawer)
  const [prospects, setProspects] = useState(contractProspects);

  // Fiche partenaire drawer
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Phase 2 dialog
  const [contractDialogProspect, setContractDialogProspect] = useState<Prospect | null>(null);

  const liveSelected = selectedProspect
    ? (prospects.find((p) => p.id === selectedProspect.id) ?? null)
    : null;

  const handleOpenFiche = useCallback((p: Prospect) => {
    setSelectedProspect(p);
    setDrawerOpen(true);
  }, []);

  const handleStageChange = useCallback(
    (id: string, newStage: import("@/types/prospect").PipelineStage) => {
      setProspects((prev) =>
        prev.map((p) => (p.id === id ? { ...p, stage: newStage } : p))
      );
      showSnackbar({ message: "Étape mise à jour", severity: "success", duration: 3000 });
    },
    [showSnackbar]
  );

  const handleNotesChange = useCallback(
    (id: string, notes: string) => {
      setProspects((prev) =>
        prev.map((p) => (p.id === id ? { ...p, notes } : p))
      );
      showSnackbar({ message: "Note enregistrée", severity: "info", duration: 2500 });
    },
    [showSnackbar]
  );

  const activeSigned   = prospects.filter((p) => p.stage === "activation_ota");
  const activeClosing  = prospects.filter((p) => p.stage === "closing");

  return (
    <Box sx={{ px: { xs: 2, sm: 3, md: 4 }, py: { xs: 2, md: 3 }, display: "flex", flexDirection: "column", gap: 3 }}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <Box>
        <Typography variant="headlineMedium" component="h1" sx={{ mb: 0.5 }}>
          Contrats
        </Typography>
        <Typography variant="bodyMedium" color="text.secondary">
          Génération PDF · Signature YouSign · Activation webhook OTA
        </Typography>
      </Box>

      {/* ── 8.1 Summary stats ──────────────────────────────────── */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" },
          gap: 2,
        }}
      >
        {[
          {
            value: prospects.length,
            label: "Contrats total",
            color: theme.palette.info.main,
            icon: <DescriptionOutlinedIcon />,
          },
          {
            value: activeClosing.length,
            label: "En cours de closing",
            color: theme.palette.warning.main,
            icon: <HourglassTopRoundedIcon />,
          },
          {
            value: activeSigned.length,
            label: "Signés & actifs",
            color: theme.palette.success.main,
            icon: <CheckCircleRoundedIcon />,
          },
          {
            value: `${avgCommission}%`,
            label: "Commission moyenne",
            color: theme.palette.primary.main,
            icon: <DrawRoundedIcon />,
          },
        ].map(({ value, label, color, icon }) => (
          <Card key={label} elevation={0} variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}>
            <Box sx={{ height: 3, bgcolor: color }} />
            <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: 2,
                  bgcolor: alpha(color, 0.12),
                  color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  mb: 1,
                }}
              >
                {icon}
              </Box>
              <Typography sx={{ fontSize: "1.75rem", fontWeight: 800, lineHeight: 1, color }}>
                {value}
              </Typography>
              <Typography variant="bodySmall" color="text.secondary" sx={{ mt: 0.25 }}>
                {label}
              </Typography>
            </CardContent>
          </Card>
        ))}
      </Box>

      {/* ── Phase 2 notice ──────────────────────────────────────── */}
      <Alert
        severity="info"
        icon={<LockClockRoundedIcon />}
        sx={{ borderRadius: 2 }}
        action={
          <Chip
            label="Roadmap Phase 2 →"
            component={Link}
            href="/prospection"
            clickable
            size="small"
            sx={{ fontSize: "0.625rem" }}
          />
        }
      >
        <Typography variant="bodySmall" sx={{ fontWeight: 700 }}>
          Génération automatique de contrats & signature électronique — Phase 2 (J60–J120)
        </Typography>
        <Typography variant="bodySmall" sx={{ display: "block" }}>
          ReportLab PDF · YouSign EIDAS · Webhook babmorocco.com API · Activation automatique dans l&apos;heure après signature.
        </Typography>
      </Alert>

      {/* ── 8.2 / 8.3 Signed & Active ──────────────────────────── */}
      {activeSigned.length > 0 && (
        <Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
            <CheckCircleRoundedIcon sx={{ color: "success.main", fontSize: 20 }} />
            <Typography variant="titleMedium" sx={{ fontWeight: 700 }}>
              Partenaires signés & actifs
            </Typography>
            <Chip label={activeSigned.length} color="success" size="small" sx={{ fontWeight: 700 }} />
          </Box>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {activeSigned.map((p) => (
              <ContractCard
                key={p.id}
                prospect={p}
                onOpenFiche={handleOpenFiche}
                onOpenContract={setContractDialogProspect}
              />
            ))}
          </Box>
        </Box>
      )}

      {/* ── 8.4 / 8.5 Closing contracts ────────────────────────── */}
      {activeClosing.length > 0 && (
        <Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
            <HourglassTopRoundedIcon sx={{ color: "warning.main", fontSize: 20 }} />
            <Typography variant="titleMedium" sx={{ fontWeight: 700 }}>
              Contrats en cours de finalisation
            </Typography>
            <Chip label={activeClosing.length} color="warning" size="small" sx={{ fontWeight: 700 }} />
          </Box>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {activeClosing.map((p) => (
              <ContractCard
                key={p.id}
                prospect={p}
                onOpenFiche={handleOpenFiche}
                onOpenContract={setContractDialogProspect}
              />
            ))}
          </Box>
        </Box>
      )}

      {prospects.length === 0 && (
        <Card elevation={0} variant="outlined" sx={{ borderRadius: 3 }}>
          <CardContent sx={{ py: 6, textAlign: "center" }}>
            <DescriptionOutlinedIcon sx={{ fontSize: 48, color: "text.disabled", mb: 1 }} />
            <Typography variant="titleSmall" color="text.secondary">
              Aucun contrat en cours
            </Typography>
            <Typography variant="bodySmall" color="text.disabled" sx={{ mt: 0.5 }}>
              Les prospects en Closing et Activation OTA apparaîtront ici.
            </Typography>
            <Button
              component={Link}
              href="/prospection"
              variant="outlined"
              sx={{ mt: 2, textTransform: "none" }}
            >
              Voir le pipeline →
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Fiche Partenaire drawer ─────────────────────────────── */}
      <ProspectDrawer
        prospect={liveSelected}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onStageChange={handleStageChange}
        onNotesChange={handleNotesChange}
      />

      {/* ── Phase 2 contract dialog ─────────────────────────────── */}
      <Phase2Dialog
        open={!!contractDialogProspect}
        onClose={() => setContractDialogProspect(null)}
        prospect={contractDialogProspect}
      />
    </Box>
  );
}
