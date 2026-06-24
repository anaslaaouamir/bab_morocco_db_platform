"use client";

import React, { useState, useMemo, useCallback } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Tooltip from "@mui/material/Tooltip";
import LinearProgress from "@mui/material/LinearProgress";
import { alpha, useTheme } from "@mui/material/styles";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import IconButton from "@mui/material/IconButton";
import Avatar from "@mui/material/Avatar";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import GavelRoundedIcon from "@mui/icons-material/GavelRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import StarRateRoundedIcon from "@mui/icons-material/StarRateRounded";
import HandshakeRoundedIcon from "@mui/icons-material/HandshakeRounded";
import SwapHorizRoundedIcon from "@mui/icons-material/SwapHorizRounded";
import EscalatorRoundedIcon from "@mui/icons-material/EscalatorRounded";
import EmojiEventsRoundedIcon from "@mui/icons-material/EmojiEventsRounded";
import ForumRoundedIcon from "@mui/icons-material/ForumRounded";
import MarkEmailReadRoundedIcon from "@mui/icons-material/MarkEmailReadRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";

import mockProspects from "@/data/mockProspects";
import type { Prospect } from "@/types/prospect";
import { scoreTotal, scoreColor, PARTNER_TYPE_LABELS, LANGUAGE_FLAGS } from "@/types/prospect";
import { useSnackbar } from "@/contexts/SnackbarContext";
import ConfirmationDialog from "@/components/shared/ConfirmationDialog";

// ─── Conversation history mock data ──────────────────────────────────────────

interface Message {
  id: string;
  from: "bab" | "partner";
  senderName: string;
  date: string;
  subject?: string;
  body: string;
  read: boolean;
}

const MOCK_CONVERSATIONS: Record<string, Message[]> = {
  p010: [
    {
      id: "m1", from: "bab", senderName: "Équipe BD — Bab Morocco", date: "2026-06-10",
      subject: "Partenariat OTA Maroc — Terres d'Aventure",
      body: "Bonjour,\n\nNous lançons Bab Morocco, une OTA 100% dédiée au Maroc destinée à la clientèle européenne et du Golfe. Votre catalogue Maroc est exactement aligné avec notre positionnement.\n\nNous proposons une commission de 12% avec un badge Partenaire Fondateur garantissant une visibilité prioritaire au lancement.\n\nSeriez-vous disponible pour un appel de 20 min cette semaine ?\n\nCordialement,\nBab Morocco BD",
      read: true,
    },
    {
      id: "m2", from: "partner", senderName: "Sophie Marchand — Terres d'Aventure", date: "2026-06-12",
      subject: "Re: Partenariat OTA Maroc — Terres d'Aventure",
      body: "Bonjour,\n\nMerci pour votre message. L'initiative est intéressante. Nous travaillons déjà avec Voyageurs du Monde et quelques OTAs en place.\n\nNous serions ouverts à discuter, mais nous aurions besoin d'au moins 14% de commission pour justifier l'intégration d'une nouvelle plateforme en phase de lancement. Nous avons également des questions sur les garanties de trafic.\n\nCordialement,\nSophie Marchand, Responsable Partenariats",
      read: true,
    },
    {
      id: "m3", from: "bab", senderName: "Équipe BD — Bab Morocco", date: "2026-06-14",
      subject: "Re: Partenariat OTA Maroc — Terres d'Aventure",
      body: "Bonjour Sophie,\n\nMerci pour votre retour. Concernant la commission, notre standard TO Europe est de 12%, mais nous pouvons étudier une commission de lancement à 13% verrouillée 12 mois, couplée à un co-marketing dédié au lancement.\n\nSur les garanties de trafic : nous ne communiquons pas de chiffres avant lancement, mais nous pouvons vous donner accès à notre beta privée pour que vous évaluiez la plateforme en conditions réelles.\n\nUn appel cette semaine pour avancer ?\n\nBab Morocco BD",
      read: true,
    },
    {
      id: "m4", from: "partner", senderName: "Sophie Marchand — Terres d'Aventure", date: "2026-06-17",
      subject: "Re: Partenariat OTA Maroc — Terres d'Aventure",
      body: "Bonjour,\n\nLa proposition à 13% est intéressante. Nous voudrions toutefois 14% si le volume reste sous 50 réservations/mois les 6 premiers mois. Nous avons aussi besoin d'un SLA sur le paiement des commissions.\n\nNous sommes prêts à signer si ces points sont validés.\n\nSophie",
      read: false,
    },
  ],
  p011: [
    {
      id: "m1", from: "bab", senderName: "Équipe BD — Bab Morocco", date: "2026-06-08",
      subject: "Partenariat stratégique — Sofitel Agadir",
      body: "Cher Directeur,\n\nBab Morocco est une OTA premium dédiée au Maroc, ciblant une clientèle européenne haut de gamme et du Golfe. Le Sofitel Agadir correspond exactement à notre positionnement 5*.\n\nNous proposons 10% de commission avec une visibilité en page d'accueil au lancement et un co-marketing ciblé EAU/France.\n\nDisponible pour un appel ?\n\nBab Morocco",
      read: true,
    },
    {
      id: "m2", from: "partner", senderName: "Khalid Benali — Dir. Commercial, Sofitel Agadir", date: "2026-06-11",
      subject: "Re: Partenariat stratégique — Sofitel Agadir",
      body: "Bonjour,\n\nMerci. Nous sommes intéressés par votre plateforme. Cependant, étant donné que vous êtes en pré-lancement, nous hésiterions à investir du temps d'intégration sans garantie de retour.\n\nNous acceptons votre offre à 10% si vous nous accordez la commission verrouillée 12 mois ET un accès à votre extranet partenaire dédié pour le suivi en temps réel.\n\nKhalid Benali",
      read: true,
    },
    {
      id: "m3", from: "bab", senderName: "Équipe BD — Bab Morocco", date: "2026-06-13",
      subject: "Re: Partenariat stratégique — Sofitel Agadir",
      body: "Cher Khalid,\n\nNous confirmons la commission à 10% verrouillée 12 mois. Pour l'extranet partenaire dédié, c'est une fonctionnalité en roadmap Q3 — nous pouvons vous promettre un accès bêta prioritaire.\n\nNous préparons un draft de contrat pour la semaine prochaine.\n\nBab Morocco BD",
      read: true,
    },
  ],
  p012: [
    {
      id: "m1", from: "bab", senderName: "Équipe BD — Bab Morocco", date: "2026-06-05",
      subject: "Collaboration Maroc — Marco Vasco",
      body: "Bonjour,\n\nVotre expertise sur les circuits Maroc correspond parfaitement à notre plateforme. Nous proposons un partenariat à 12% avec badge Fondateur et accès beta.\n\nBab Morocco",
      read: true,
    },
    {
      id: "m2", from: "partner", senderName: "Julie Chen — Marco Vasco Partenariats", date: "2026-06-09",
      subject: "Re: Collaboration Maroc — Marco Vasco",
      body: "Bonjour,\n\nIntéressant, mais nous avons des engagements avec d'autres OTAs. Nous pourrions envisager un partenariat non-exclusif à 14% minimum. Nous avons également besoin d'un reporting mensuel automatisé des réservations.\n\nJulie Chen",
      read: false,
    },
  ],
};

// Fallback conversation for any other prospect in négociation
const FALLBACK_MESSAGES: Message[] = [
  {
    id: "f1", from: "bab", senderName: "Équipe BD — Bab Morocco", date: "2026-06-12",
    subject: "Proposition de partenariat — Bab Morocco",
    body: "Bonjour,\n\nNous vous contactons au sujet d'un partenariat sur notre plateforme OTA dédiée au Maroc.\n\nBab Morocco BD",
    read: true,
  },
  {
    id: "f2", from: "partner", senderName: "Contact partenaire", date: "2026-06-15",
    subject: "Re: Proposition de partenariat — Bab Morocco",
    body: "Bonjour,\n\nMerci pour votre message. Nous sommes intéressés mais avons quelques questions sur les conditions.\n\nCordialement",
    read: false,
  },
];

// ─── ConversationHistoryDialog ────────────────────────────────────────────────

function ConversationHistoryDialog({
  open,
  onClose,
  prospect,
}: {
  open: boolean;
  onClose: () => void;
  prospect: Prospect | null;
}) {
  const theme = useTheme();
  if (!prospect) return null;

  const messages = MOCK_CONVERSATIONS[prospect.id] ?? FALLBACK_MESSAGES;
  const unreadCount = messages.filter((m) => !m.read).length;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      scroll="paper"
      PaperProps={{ sx: { borderRadius: 3, maxHeight: "85dvh" } }}
    >
      <DialogTitle
        sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 3, py: 2, borderBottom: 1, borderColor: "divider" }}
      >
        <ForumRoundedIcon sx={{ color: "secondary.main" }} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="titleLarge" sx={{ fontWeight: 700 }}>
            Historique des échanges
          </Typography>
          <Typography variant="bodySmall" color="text.secondary">
            {prospect.nom} · {messages.length} message{messages.length > 1 ? "s" : ""}
            {unreadCount > 0 && (
              <Typography component="span" variant="bodySmall" sx={{ color: "error.main", fontWeight: 700, ml: 1 }}>
                · {unreadCount} non lu{unreadCount > 1 ? "s" : ""}
              </Typography>
            )}
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseRoundedIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ px: 3, py: 3, display: "flex", flexDirection: "column", gap: 2 }}>
        {messages.map((msg, idx) => {
          const isBab = msg.from === "bab";
          return (
            <Box key={msg.id}>
              {/* Date separator between days */}
              {(idx === 0 || messages[idx - 1].date !== msg.date) && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, my: 1 }}>
                  <Divider sx={{ flex: 1 }} />
                  <Typography variant="labelSmall" color="text.disabled" sx={{ px: 1, flexShrink: 0 }}>
                    {new Date(msg.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                  </Typography>
                  <Divider sx={{ flex: 1 }} />
                </Box>
              )}

              <Box
                sx={{
                  display: "flex",
                  flexDirection: isBab ? "row-reverse" : "row",
                  gap: 1.5,
                  alignItems: "flex-start",
                }}
              >
                <Avatar
                  sx={{
                    width: 32,
                    height: 32,
                    bgcolor: isBab ? "primary.main" : alpha(theme.palette.secondary.main, 0.15),
                    color: isBab ? "primary.contrastText" : "secondary.main",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {isBab ? "BM" : msg.senderName.charAt(0)}
                </Avatar>

                <Box sx={{ maxWidth: "78%", minWidth: 0 }}>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      mb: 0.5,
                      flexDirection: isBab ? "row-reverse" : "row",
                    }}
                  >
                    <Typography variant="labelSmall" sx={{ fontWeight: 700 }}>
                      {msg.senderName}
                    </Typography>
                    {!msg.read && !isBab && (
                      <Chip
                        label="Non lu"
                        size="small"
                        color="error"
                        sx={{ height: 16, fontSize: "0.5625rem", "& .MuiChip-label": { px: 0.625 } }}
                      />
                    )}
                    {isBab && (
                      <MarkEmailReadRoundedIcon sx={{ fontSize: 13, color: msg.read ? "success.main" : "text.disabled" }} />
                    )}
                  </Box>

                  {msg.subject && (
                    <Typography
                      variant="labelSmall"
                      color="text.secondary"
                      sx={{ display: "block", mb: 0.75, fontStyle: "italic", textAlign: isBab ? "right" : "left" }}
                    >
                      {msg.subject}
                    </Typography>
                  )}

                  <Box
                    sx={{
                      p: "10px 14px",
                      borderRadius: isBab ? "12px 4px 12px 12px" : "4px 12px 12px 12px",
                      bgcolor: isBab
                        ? alpha(theme.palette.primary.main, 0.1)
                        : "action.hover",
                      border: `1px solid ${isBab
                        ? alpha(theme.palette.primary.main, 0.2)
                        : theme.palette.divider}`,
                    }}
                  >
                    {msg.body.split("\n").map((line, i) => (
                      <Typography key={i} variant="bodySmall" sx={{ display: "block", lineHeight: 1.6 }}>
                        {line || <br />}
                      </Typography>
                    ))}
                  </Box>
                </Box>
              </Box>
            </Box>
          );
        })}

        {/* Compose hint */}
        <Box
          sx={{
            mt: 1,
            p: 1.5,
            borderRadius: 2,
            border: `1.5px dashed ${theme.palette.divider}`,
            display: "flex",
            alignItems: "center",
            gap: 1,
            color: "text.disabled",
          }}
        >
          <SendRoundedIcon sx={{ fontSize: 16 }} />
          <Typography variant="bodySmall" color="text.disabled">
            La rédaction de réponses sera disponible après connexion backend (Phase 1).
          </Typography>
        </Box>
      </DialogContent>
    </Dialog>
  );
}

// ─── Non-financial perks (spec §6) ───────────────────────────────────────────

const NON_FINANCIAL_PERKS = [
  { id: "badge",       label: "Badge Partenaire Fondateur",     desc: "Visibilité maximale au lancement" },
  { id: "lock",        label: "Commission verrouillée 12 mois", desc: "Même taux garanti même si volume faible" },
  { id: "comarketing", label: "Co-marketing lancement",         desc: "Newsletter, réseaux sociaux, page dédiée" },
  { id: "feedback",    label: "Influence produit",              desc: "Feedback direct sur l'extranet partenaire" },
  { id: "beta",        label: "Accès bêta privé",               desc: "Avant le lancement public officiel" },
];

// ─── Negotiation analysis ─────────────────────────────────────────────────────

interface NegotiationAnalysis {
  intentLabel: string;
  intentColor: "success" | "warning" | "info" | "error";
  intentScore: number;
  objectionType: string;
  objectionDetail: string;
  requestedRate: number;
  requiresHumanValidation: boolean;
}

function analyzeNegotiation(p: Prospect): NegotiationAnalysis {
  const notes = p.notes ?? "";

  const ratePatterns = [notes.match(/commission\s+(\d+)%/i), notes.match(/(\d+)%\s+discuté/i)];
  const rateMatch = ratePatterns.find(Boolean)?.[1];
  const requestedRate = rateMatch ? parseInt(rateMatch) : p.commissionStandard;

  let intentLabel: string;
  let intentColor: NegotiationAnalysis["intentColor"];
  let intentScore: number;
  if (notes.includes("Très motivé")) {
    intentLabel = "Très motivé"; intentColor = "success"; intentScore = 5;
  } else if (notes.includes("Intéressé")) {
    intentLabel = "Intéressé"; intentColor = "info"; intentScore = 4;
  } else if (notes.includes("Contre-offre")) {
    intentLabel = "Contre-offre"; intentColor = "warning"; intentScore = 3;
  } else {
    intentLabel = "Objection"; intentColor = "error"; intentScore = 2;
  }

  let objectionType: string;
  let objectionDetail: string;
  if (notes.includes("risque") || notes.includes("pré-lancement")) {
    objectionType = "Risque pré-lancement";
    objectionDetail = "Le partenaire hésite face au risque d'une plateforme non encore lancée. Contreparties de confiance prioritaires.";
  } else if (notes.includes("reporting") || notes.includes("SLA")) {
    objectionType = "Conditions opérationnelles";
    objectionDetail = "Le partenaire demande des garanties de service et de suivi mesurables (SLA, reporting mensuel).";
  } else if (notes.includes("extranet") || notes.includes("dédié")) {
    objectionType = "Commission + Extranet dédié";
    objectionDetail = "Le partenaire demande une commission supérieure et un outil de gestion partenaire dédié.";
  } else {
    objectionType = "Niveau de commission";
    objectionDetail = "Discussion centrée sur le taux de commission. Évaluer les contreparties non-financières avant toute concession.";
  }

  const requiresHumanValidation =
    notes.includes("VALIDATION HUMAINE REQUISE") || requestedRate < p.commissionPlancher;

  return { intentLabel, intentColor, intentScore, objectionType, objectionDetail, requestedRate, requiresHumanValidation };
}

// ─── Scenario types / generator ───────────────────────────────────────────────

interface Scenario {
  id: "A" | "B" | "C";
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  rate: number | null;
  pros: string[];
  cons: string[];
  severity: "success" | "warning" | "error" | "info";
  requiresEscalation: boolean;
}

function generateScenarios(p: Prospect, analysis: NegotiationAnalysis, counterparts: string[]): Scenario[] {
  const { requestedRate } = analysis;
  const { commissionStandard: std, commissionPlancher: plancher } = p;
  const aboveStd = requestedRate > std;
  const belowPlancher = requestedRate < plancher;
  const selectedLabels = NON_FINANCIAL_PERKS.filter((k) => counterparts.includes(k.id)).map((k) => k.label);

  return [
    {
      id: "A",
      icon: <HandshakeRoundedIcon />,
      title: "A — Accepter",
      subtitle: aboveStd ? `Accorder les ${requestedRate}% demandés` : `Concéder à ${requestedRate}%`,
      rate: requestedRate,
      pros: [
        "Closing rapide — partenariat immédiat",
        aboveStd ? "Signal fort de confiance envers le partenaire" : "Geste commercial visible",
      ],
      cons: [
        aboveStd
          ? `Commission ${requestedRate - std}pts au-dessus du standard — précédent risqué`
          : `Marge ${std - requestedRate}pts sous le standard`,
        belowPlancher ? "⚠ SOUS LE PLANCHER — escalade humaine obligatoire" : "",
      ].filter(Boolean),
      severity: belowPlancher ? "error" : aboveStd ? "warning" : "success",
      requiresEscalation: belowPlancher,
    },
    {
      id: "B",
      icon: <SwapHorizRoundedIcon />,
      title: "B — Contre-proposer",
      subtitle: `Maintenir ${std}% + contreparties non-financières`,
      rate: std,
      pros: [
        "Commission standard préservée — marge protégée",
        "Valeur ajoutée non-financière élevée",
        selectedLabels.length > 0
          ? `Contreparties : ${selectedLabels.slice(0, 2).join(", ")}${selectedLabels.length > 2 ? "…" : ""}`
          : "Sélectionnez des contreparties ci-dessous pour personnaliser l'offre",
      ],
      cons: [
        "Cycle de négociation rallongé de 48–72h",
        "Risque de refus si le partenaire est ferme sur ses conditions",
      ],
      severity: "success",
      requiresEscalation: false,
    },
    {
      id: "C",
      icon: <EscalatorRoundedIcon />,
      title: "C — Escalade humaine",
      subtitle: "Soumettre au responsable commercial",
      rate: null,
      pros: [
        "Décision stratégique éclairée",
        "Flexibilité maximale hors cadre standard",
        "Relation partenaire préservée sur le long terme",
      ],
      cons: [
        "Délai supplémentaire (24–48h)",
        "Mobilisation d'une ressource managériale",
      ],
      severity: "info",
      requiresEscalation: true,
    },
  ];
}

// ─── NegotiationProspectCard ──────────────────────────────────────────────────

function NegotiationProspectCard({
  prospect,
  selected,
  onSelect,
}: {
  prospect: Prospect;
  selected: boolean;
  onSelect: () => void;
}) {
  const theme = useTheme();
  const analysis = analyzeNegotiation(prospect);
  const total = scoreTotal(prospect.score);
  const color = scoreColor(total);

  return (
    <Card
      elevation={0}
      variant="outlined"
      onClick={onSelect}
      sx={{
        borderRadius: 2.5,
        borderColor: selected ? "secondary.main" : "divider",
        borderWidth: selected ? 2 : 1,
        bgcolor: selected ? alpha(theme.palette.secondary.main, 0.04) : "background.paper",
        transition: "border-color 150ms ease, background-color 150ms ease",
        cursor: "pointer",
        "&:hover": { boxShadow: theme.shadows[2] },
      }}
    >
      <CardContent sx={{ p: "12px 14px !important" }}>
        <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1, mb: 0.75 }}>
          <Typography variant="titleSmall" sx={{ fontWeight: 700, lineHeight: 1.3, flex: 1 }}>
            {prospect.nom}
          </Typography>
          <Box
            sx={{
              px: 0.75, py: 0.125, borderRadius: 1,
              bgcolor: alpha(theme.palette[color].main, 0.12),
              border: `1px solid ${alpha(theme.palette[color].main, 0.3)}`,
              display: "flex", alignItems: "center", gap: 0.25, flexShrink: 0,
            }}
          >
            <StarRateRoundedIcon sx={{ fontSize: 11, color: `${color}.main` }} />
            <Typography sx={{ fontSize: "0.6875rem", fontWeight: 700, color: `${color}.main`, lineHeight: 1 }}>
              {total}
            </Typography>
          </Box>
        </Box>

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

        <Divider sx={{ my: 0.75 }} />

        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
          <Chip
            label={analysis.intentLabel}
            color={analysis.intentColor}
            size="small"
            sx={{ height: 20, fontSize: "0.625rem", fontWeight: 700, "& .MuiChip-label": { px: 0.875 } }}
          />
          <Typography variant="labelSmall" color="text.secondary">
            Demande{" "}
            <Typography
              component="span"
              variant="labelSmall"
              sx={{
                fontWeight: 800,
                color: analysis.requestedRate > prospect.commissionStandard ? "warning.main" : "text.primary",
              }}
            >
              {analysis.requestedRate}%
            </Typography>
            {" "}(std {prospect.commissionStandard}%)
          </Typography>
        </Box>

        {analysis.requiresHumanValidation && (
          <Box
            sx={{
              mt: 0.875, px: 0.75, py: 0.375, borderRadius: 1,
              bgcolor: alpha(theme.palette.error.main, 0.08),
              border: `1px solid ${alpha(theme.palette.error.main, 0.25)}`,
            }}
          >
            <Typography variant="labelSmall" sx={{ color: "error.main", fontWeight: 700, fontSize: "0.5938rem" }}>
              ⚠ VALIDATION HUMAINE REQUISE
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

// ─── ScenarioCard ─────────────────────────────────────────────────────────────

function ScenarioCard({ scenario, onValidate }: { scenario: Scenario; onValidate: (s: Scenario) => void }) {
  const theme = useTheme();
  const palette = theme.palette[scenario.severity];

  return (
    <Card
      elevation={0}
      variant="outlined"
      sx={{
        borderRadius: 2.5,
        borderLeft: `4px solid ${palette.main}`,
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <CardContent sx={{ p: "14px 16px !important", flex: 1, display: "flex", flexDirection: "column" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
          <Box sx={{ color: `${scenario.severity}.main`, display: "flex", flexShrink: 0 }}>
            {scenario.icon}
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="titleSmall" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              {scenario.title}
            </Typography>
            <Typography variant="bodySmall" color="text.secondary">{scenario.subtitle}</Typography>
          </Box>
          {scenario.rate !== null && (
            <Box sx={{ px: 1, py: 0.25, borderRadius: 1.5, bgcolor: alpha(palette.main, 0.12), flexShrink: 0 }}>
              <Typography sx={{ fontSize: "0.875rem", fontWeight: 800, color: `${scenario.severity}.main` }}>
                {scenario.rate}%
              </Typography>
            </Box>
          )}
        </Box>

        <Box sx={{ mb: 1 }}>
          {scenario.pros.map((pro) => (
            <Box key={pro} sx={{ display: "flex", alignItems: "flex-start", gap: 0.75, mb: 0.375 }}>
              <CheckRoundedIcon sx={{ fontSize: 14, color: "success.main", mt: "2px", flexShrink: 0 }} />
              <Typography variant="bodySmall">{pro}</Typography>
            </Box>
          ))}
        </Box>

        <Box sx={{ mb: 1.5 }}>
          {scenario.cons.map((con) => (
            <Box key={con} sx={{ display: "flex", alignItems: "flex-start", gap: 0.75, mb: 0.375 }}>
              <CloseRoundedIcon sx={{ fontSize: 14, color: "error.main", mt: "2px", flexShrink: 0 }} />
              <Typography variant="bodySmall" color="text.secondary">{con}</Typography>
            </Box>
          ))}
        </Box>

        {scenario.requiresEscalation && scenario.id === "A" && (
          <Alert severity="error" sx={{ mb: 1.5, py: 0.25, "& .MuiAlert-message": { fontSize: "0.75rem" } }}>
            Validation humaine obligatoire — commission sous le plancher absolu
          </Alert>
        )}

        <Box sx={{ mt: "auto" }}>
          <Button
            variant={scenario.severity === "success" ? "contained" : "outlined"}
            color={scenario.severity === "error" ? "error" : scenario.severity === "info" ? "inherit" : scenario.severity}
            size="small"
            fullWidth
            onClick={() => onValidate(scenario)}
            sx={{ fontWeight: 700, textTransform: "none" }}
          >
            Choisir le scénario {scenario.id}
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NegociationPage() {
  const { showSnackbar } = useSnackbar();
  const theme = useTheme();
  const [allProspects] = useState(mockProspects);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [counterparts, setCounterparts] = useState<string[]>([]);
  const [confirmScenario, setConfirmScenario] = useState<Scenario | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const negProspects = useMemo(() => allProspects.filter((p) => p.stage === "negociation"), [allProspects]);

  const selectedProspect = useMemo(
    () => (selectedId ? negProspects.find((p) => p.id === selectedId) ?? null : null),
    [selectedId, negProspects]
  );

  const analysis = useMemo(
    () => (selectedProspect ? analyzeNegotiation(selectedProspect) : null),
    [selectedProspect]
  );

  const scenarios = useMemo(
    () => (selectedProspect && analysis ? generateScenarios(selectedProspect, analysis, counterparts) : []),
    [selectedProspect, analysis, counterparts]
  );

  React.useEffect(() => {
    if (!selectedId && negProspects.length > 0) setSelectedId(negProspects[0].id);
  }, [negProspects, selectedId]);

  React.useEffect(() => {
    setCounterparts([]);
  }, [selectedId]);

  const toggleCounterpart = useCallback((id: string) => {
    setCounterparts((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  function handleValidateScenario(s: Scenario) {
    setConfirmScenario(s);
  }

  function handleConfirm() {
    if (!confirmScenario) return;
    showSnackbar({
      message: `Scénario ${confirmScenario.id} soumis — validation équipe commerciale requise`,
      severity: confirmScenario.id === "C" ? "warning" : "success",
      duration: 5000,
    });
    setConfirmScenario(null);
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      {/* Header */}
      <Box sx={{ px: { xs: 2, sm: 3, md: 4 }, pt: { xs: 2, md: 3 }, pb: 2 }}>
        <Typography variant="headlineMedium" component="h1" sx={{ mb: 0.5 }}>
          Négociation
        </Typography>
        <Typography variant="bodyMedium" color="text.secondary" sx={{ mb: 2 }}>
          Analyse sémantique des réponses · 3 scénarios IA · Contreparties non-financières prioritaires (Spec §6)
        </Typography>

        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
          {[
            { label: "En négociation", value: negProspects.length, color: "secondary" as const },
            {
              label: "Validation requise",
              value: negProspects.filter((p) => analyzeNegotiation(p).requiresHumanValidation).length,
              color: "error" as const,
            },
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
        <Box sx={{ width: { md: 340 }, flexShrink: 0, display: "flex", flexDirection: "column", gap: 1.5 }}>
          {negProspects.map((p) => (
            <NegotiationProspectCard
              key={p.id}
              prospect={p}
              selected={selectedId === p.id}
              onSelect={() => setSelectedId(p.id)}
            />
          ))}
        </Box>

        {/* Right: analysis panel */}
        <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          {selectedProspect && analysis ? (
            <>
              {/* VALIDATION HUMAINE banner */}
              {analysis.requiresHumanValidation && (
                <Alert severity="error" icon={<WarningAmberRoundedIcon />}>
                  <AlertTitle>
                    <strong>VALIDATION HUMAINE REQUISE — {selectedProspect.nom}</strong>
                  </AlertTitle>
                  Commission demandée ({analysis.requestedRate}%) sous le plancher absolu ({selectedProspect.commissionPlancher}%) ou dossier signalé.
                  Aucun accord ne peut être conclu sans validation d&apos;un responsable commercial.
                </Alert>
              )}

              {/* Response analysis card */}
              <Card elevation={0} variant="outlined" sx={{ borderRadius: 2.5 }}>
                <CardContent sx={{ p: "16px 20px !important" }}>
                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
                    <Typography variant="titleMedium" sx={{ fontWeight: 700 }}>
                      Analyse de la réponse — {selectedProspect.nom}
                    </Typography>
                    <Tooltip title="Historique des échanges" placement="top">
                      <IconButton
                        size="small"
                        onClick={() => setHistoryOpen(true)}
                        sx={{
                          color: "secondary.main",
                          bgcolor: alpha(theme.palette.secondary.main, 0.08),
                          "&:hover": { bgcolor: alpha(theme.palette.secondary.main, 0.16) },
                        }}
                      >
                        <ForumRoundedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>

                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mb: 2 }}>
                    <Box>
                      <Typography variant="labelSmall" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                        Niveau d&apos;intérêt
                      </Typography>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Chip label={analysis.intentLabel} color={analysis.intentColor} size="small" sx={{ fontWeight: 700 }} />
                        <Box sx={{ display: "flex", gap: 0.375 }}>
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Box
                              key={i}
                              sx={{
                                width: 8, height: 8, borderRadius: "50%",
                                bgcolor: i < analysis.intentScore
                                  ? theme.palette[analysis.intentColor].main
                                  : theme.palette.action.disabledBackground,
                              }}
                            />
                          ))}
                        </Box>
                      </Box>
                    </Box>

                    <Box sx={{ flex: 1, minWidth: 180 }}>
                      <Typography variant="labelSmall" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                        Type d&apos;objection
                      </Typography>
                      <Chip
                        label={analysis.objectionType}
                        size="small"
                        variant="outlined"
                        icon={<GavelRoundedIcon sx={{ fontSize: "14px !important" }} />}
                        sx={{ fontWeight: 600 }}
                      />
                    </Box>
                  </Box>

                  <Typography variant="bodySmall" color="text.secondary" sx={{ fontStyle: "italic", mb: 2 }}>
                    {analysis.objectionDetail}
                  </Typography>

                  {/* Commission comparison */}
                  <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: "action.hover", display: "flex", gap: 2, flexWrap: "wrap" }}>
                    {[
                      { label: "Standard",          value: selectedProspect.commissionStandard, colorKey: "primary.main" },
                      { label: "Plancher absolu",   value: selectedProspect.commissionPlancher, colorKey: "error.main" },
                      {
                        label: "Demande partenaire",
                        value: analysis.requestedRate,
                        colorKey:
                          analysis.requestedRate < selectedProspect.commissionPlancher
                            ? "error.main"
                            : analysis.requestedRate > selectedProspect.commissionStandard
                            ? "warning.main"
                            : "success.main",
                      },
                    ].map((item) => (
                      <Box key={item.label} sx={{ flex: 1, minWidth: 90 }}>
                        <Typography variant="labelSmall" color="text.secondary" sx={{ display: "block", mb: 0.25 }}>
                          {item.label}
                        </Typography>
                        <Typography sx={{ fontSize: "1.25rem", fontWeight: 800, color: item.colorKey, lineHeight: 1 }}>
                          {item.value}%
                        </Typography>
                        <LinearProgress
                          variant="determinate"
                          value={Math.min(100, (item.value / 25) * 100)}
                          sx={{
                            mt: 0.5, height: 4, borderRadius: 2,
                            bgcolor: alpha(theme.palette.divider, 0.5),
                            "& .MuiLinearProgress-bar": { bgcolor: item.colorKey, borderRadius: 2 },
                          }}
                        />
                      </Box>
                    ))}
                  </Box>

                  {analysis.requestedRate < selectedProspect.commissionPlancher && (
                    <Alert severity="error" icon={<WarningAmberRoundedIcon fontSize="small" />} sx={{ mt: 1.5, "& .MuiAlert-message": { fontSize: "0.8125rem" } }}>
                      <strong>Commission sous le plancher absolu ({selectedProspect.commissionPlancher}%)</strong> — Tout accord à{" "}
                      {analysis.requestedRate}% nécessite une validation humaine avant toute réponse.
                    </Alert>
                  )}
                </CardContent>
              </Card>

              {/* Non-financial counterparts */}
              <Card elevation={0} variant="outlined" sx={{ borderRadius: 2.5 }}>
                <CardContent sx={{ p: "16px 20px !important" }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                    <EmojiEventsRoundedIcon sx={{ color: "warning.main", fontSize: 20 }} />
                    <Typography variant="titleSmall" sx={{ fontWeight: 700 }}>
                      Contreparties non-financières
                    </Typography>
                    <Typography variant="labelSmall" color="text.secondary" sx={{ ml: "auto", display: { xs: "none", sm: "block" } }}>
                      Priorité avant toute concession commission (Spec §6)
                    </Typography>
                  </Box>
                  <Typography variant="bodySmall" color="text.secondary" sx={{ mb: 1.5 }}>
                    Sélectionnez les contreparties à inclure dans le Scénario B :
                  </Typography>
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                    {NON_FINANCIAL_PERKS.map((perk) => (
                      <Tooltip key={perk.id} title={perk.desc} placement="top" arrow>
                        <Chip
                          label={perk.label}
                          size="small"
                          variant={counterparts.includes(perk.id) ? "filled" : "outlined"}
                          color={counterparts.includes(perk.id) ? "success" : "default"}
                          onClick={() => toggleCounterpart(perk.id)}
                          icon={counterparts.includes(perk.id) ? <CheckRoundedIcon sx={{ fontSize: "14px !important" }} /> : undefined}
                          sx={{ fontWeight: 600, cursor: "pointer" }}
                        />
                      </Tooltip>
                    ))}
                  </Box>
                </CardContent>
              </Card>

              {/* 3 Scenario cards */}
              <Box>
                <Typography variant="titleSmall" sx={{ fontWeight: 700, mb: 1.5 }}>
                  Scénarios de réponse — choisissez et validez
                </Typography>
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 2 }}>
                  {scenarios.map((s) => (
                    <ScenarioCard key={s.id} scenario={s} onValidate={handleValidateScenario} />
                  ))}
                </Box>
              </Box>
            </>
          ) : (
            <Box
              sx={{
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                flex: 1, minHeight: 320, borderRadius: 2.5, border: `2px dashed ${theme.palette.divider}`,
                color: "text.disabled", gap: 2,
              }}
            >
              <PersonRoundedIcon sx={{ fontSize: 48, opacity: 0.4 }} />
              <Typography variant="titleSmall" color="text.disabled">
                Sélectionnez un partenaire pour voir l&apos;analyse de négociation
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      <ConversationHistoryDialog
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        prospect={selectedProspect}
      />

      {confirmScenario && selectedProspect && (
        <ConfirmationDialog
          open
          onClose={() => setConfirmScenario(null)}
          onConfirm={handleConfirm}
          title={`Valider le scénario ${confirmScenario.id} ?`}
          description={
            <Box>
              <Typography variant="bodyMedium" color="text.secondary" sx={{ mb: 1 }}>
                <strong>{confirmScenario.title}</strong> — {confirmScenario.subtitle}
              </Typography>
              {confirmScenario.requiresEscalation && (
                <Typography variant="bodySmall" color="error.main" sx={{ fontWeight: 600 }}>
                  ⚠ Validation humaine obligatoire avant toute réponse au partenaire.
                </Typography>
              )}
            </Box>
          }
          confirmLabel={`Valider scénario ${confirmScenario.id}`}
          confirmColor={confirmScenario.severity === "error" ? "error" : "primary"}
        />
      )}
    </Box>
  );
}
