"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
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
import Skeleton from "@mui/material/Skeleton";
import TextField from "@mui/material/TextField";
import CircularProgress from "@mui/material/CircularProgress";
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
import InboxRoundedIcon from "@mui/icons-material/InboxRounded";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";

import type { Prospect } from "@/types/prospect";
import { scoreTotal, scoreColor, PARTNER_TYPE_LABELS, LANGUAGE_FLAGS } from "@/types/prospect";
import { useSnackbar } from "@/contexts/SnackbarContext";
import ConfirmationDialog from "@/components/shared/ConfirmationDialog";
import { prospectsApi, negotiationApi, ApiError } from "@/lib/api";
import type { RawMessageAnalysis, RawNegotiationMessage, RawScenario } from "@/lib/api";

// ─── Non-financial perks (spec §6) ───────────────────────────────────────────

const NON_FINANCIAL_PERKS = [
  { id: "badge",       label: "Badge Partenaire Fondateur",     desc: "Visibilité maximale au lancement" },
  { id: "lock",        label: "Commission verrouillée 12 mois", desc: "Même taux garanti même si volume faible" },
  { id: "comarketing", label: "Co-marketing lancement",         desc: "Newsletter, réseaux sociaux, page dédiée" },
  { id: "feedback",    label: "Influence produit",              desc: "Feedback direct sur l'extranet partenaire" },
  { id: "beta",        label: "Accès bêta privé",               desc: "Avant le lancement public officiel" },
];

// ─── Intent helpers ───────────────────────────────────────────────────────────

const INTENT_MAP: Record<string, { label: string; color: "success" | "warning" | "info" | "error" }> = {
  tres_motive:  { label: "Très motivé",   color: "success" },
  interesse:    { label: "Intéressé",     color: "info" },
  contre_offre: { label: "Contre-offre",  color: "warning" },
  objection:    { label: "Objection",     color: "error" },
  neutre:       { label: "Neutre",        color: "info" },
};

function intentDisplay(intent: string | null) {
  if (!intent) return { label: "Inconnu", color: "info" as const };
  return INTENT_MAP[intent] ?? { label: intent, color: "info" as const };
}

// ─── ConversationHistoryDialog ────────────────────────────────────────────────

function ConversationHistoryDialog({
  open,
  onClose,
  prospect,
  messages,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  prospect: Prospect | null;
  messages: RawNegotiationMessage[];
  loading: boolean;
}) {
  const theme = useTheme();
  if (!prospect) return null;

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
            {prospect.nom} · {messages.length} message{messages.length !== 1 ? "s" : ""}
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseRoundedIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ px: 3, py: 3, display: "flex", flexDirection: "column", gap: 2 }}>
        {loading ? (
          [1, 2, 3].map((i) => <Skeleton key={i} variant="rounded" height={80} sx={{ borderRadius: 2 }} />)
        ) : messages.length === 0 ? (
          <Box sx={{ py: 6, display: "flex", flexDirection: "column", alignItems: "center", gap: 1.5, color: "text.disabled" }}>
            <InboxRoundedIcon sx={{ fontSize: 40 }} />
            <Typography variant="bodyMedium">Aucun message enregistré</Typography>
            <Typography variant="bodySmall" color="text.disabled">
              Soumettez le premier message du partenaire pour démarrer la négociation.
            </Typography>
          </Box>
        ) : (
          messages.map((msg, idx) => {
            const isBab = msg.direction === "outbound";
            const dateStr = new Date(msg.date_message).toLocaleDateString("fr-FR", {
              day: "numeric", month: "long", year: "numeric",
            });
            const prevDate = idx > 0
              ? new Date(messages[idx - 1].date_message).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
              : null;

            return (
              <Box key={msg.id}>
                {(idx === 0 || prevDate !== dateStr) && (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, my: 1 }}>
                    <Divider sx={{ flex: 1 }} />
                    <Typography variant="labelSmall" color="text.disabled" sx={{ px: 1, flexShrink: 0 }}>
                      {dateStr}
                    </Typography>
                    <Divider sx={{ flex: 1 }} />
                  </Box>
                )}

                <Box sx={{ display: "flex", flexDirection: isBab ? "row-reverse" : "row", gap: 1.5, alignItems: "flex-start" }}>
                  <Avatar
                    sx={{
                      width: 32, height: 32,
                      bgcolor: isBab ? "primary.main" : alpha(theme.palette.secondary.main, 0.15),
                      color: isBab ? "primary.contrastText" : "secondary.main",
                      fontSize: "0.75rem", fontWeight: 700, flexShrink: 0,
                    }}
                  >
                    {isBab ? "BM" : prospect.nomContact.charAt(0)}
                  </Avatar>

                  <Box sx={{ maxWidth: "78%", minWidth: 0 }}>
                    <Box
                      sx={{
                        display: "flex", alignItems: "center", gap: 1, mb: 0.5,
                        flexDirection: isBab ? "row-reverse" : "row",
                      }}
                    >
                      <Typography variant="labelSmall" sx={{ fontWeight: 700 }}>
                        {isBab ? "Équipe BD — Bab Morocco" : prospect.nomContact}
                      </Typography>
                      {!isBab && msg.analyse_intent && (
                        <Chip
                          label={intentDisplay(msg.analyse_intent).label}
                          color={intentDisplay(msg.analyse_intent).color}
                          size="small"
                          sx={{ height: 16, fontSize: "0.5625rem", "& .MuiChip-label": { px: 0.625 } }}
                        />
                      )}
                      {isBab && (
                        <MarkEmailReadRoundedIcon sx={{ fontSize: 13, color: "success.main" }} />
                      )}
                    </Box>

                    <Box
                      sx={{
                        p: "10px 14px",
                        borderRadius: isBab ? "12px 4px 12px 12px" : "4px 12px 12px 12px",
                        bgcolor: isBab ? alpha(theme.palette.primary.main, 0.1) : "action.hover",
                        border: `1px solid ${isBab ? alpha(theme.palette.primary.main, 0.2) : theme.palette.divider}`,
                      }}
                    >
                      {msg.corps.split("\n").map((line, i) => (
                        <Typography key={i} variant="bodySmall" sx={{ display: "block", lineHeight: 1.6 }}>
                          {line || <br />}
                        </Typography>
                      ))}
                    </Box>

                    {!isBab && msg.analyse_objection && (
                      <Typography variant="labelSmall" color="text.disabled" sx={{ mt: 0.5, display: "block", fontStyle: "italic" }}>
                        Objection : {msg.analyse_objection}
                      </Typography>
                    )}
                  </Box>
                </Box>
              </Box>
            );
          })
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── SubmitMessagePanel ───────────────────────────────────────────────────────

function SubmitMessagePanel({
  prospect,
  onAnalysisReady,
}: {
  prospect: Prospect;
  onAnalysisReady: (analysis: RawMessageAnalysis) => void;
}) {
  const { showSnackbar } = useSnackbar();
  const [messageText, setMessageText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!messageText.trim()) return;
    setSubmitting(true);
    try {
      const analysis = await negotiationApi.submitMessage(prospect.id, messageText.trim());
      onAnalysisReady(analysis);
      showSnackbar({ message: "Message analysé — scénarios générés.", severity: "success" });
      setMessageText("");
    } catch (err) {
      showSnackbar({
        message: err instanceof ApiError ? err.detail : "Erreur lors de l'analyse du message.",
        severity: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card elevation={0} variant="outlined" sx={{ borderRadius: 2.5 }}>
      <CardContent sx={{ p: "16px 20px !important" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
          <AutoAwesomeRoundedIcon sx={{ color: "secondary.main", fontSize: 20 }} />
          <Typography variant="titleSmall" sx={{ fontWeight: 700 }}>
            Soumettre le message du partenaire
          </Typography>
        </Box>
        <Typography variant="bodySmall" color="text.secondary" sx={{ mb: 1.5 }}>
          Collez le message reçu de <strong>{prospect.nom}</strong> — l&apos;IA analysera l&apos;intention, l&apos;objection et générera 3 scénarios de réponse.
        </Typography>
        <TextField
          multiline
          minRows={5}
          fullWidth
          placeholder="Collez le message du partenaire ici…"
          value={messageText}
          onChange={(e) => setMessageText(e.target.value)}
          disabled={submitting}
          sx={{ mb: 1.5, "& .MuiInputBase-root": { fontSize: "0.8125rem" } }}
        />
        <Button
          variant="contained"
          color="secondary"
          startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : <AutoAwesomeRoundedIcon />}
          onClick={handleSubmit}
          disabled={submitting || !messageText.trim()}
          sx={{ fontWeight: 700, textTransform: "none" }}
        >
          {submitting ? "Analyse en cours…" : "Analyser et générer les scénarios"}
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── ScenarioCard ─────────────────────────────────────────────────────────────

const SCENARIO_DISPLAY: Record<string, {
  icon: React.ReactNode;
  severity: "success" | "warning" | "error" | "info";
}> = {
  A: { icon: <HandshakeRoundedIcon />, severity: "success" },
  B: { icon: <SwapHorizRoundedIcon />, severity: "success" },
  C: { icon: <EscalatorRoundedIcon />, severity: "info" },
};

function ScenarioCard({
  scenario,
  requiresHuman,
  taux,
  onValidate,
}: {
  scenario: RawScenario;
  requiresHuman: boolean;
  taux: number | null;
  onValidate: (s: RawScenario) => void;
}) {
  const theme = useTheme();
  const display = SCENARIO_DISPLAY[scenario.scenario] ?? { icon: <HandshakeRoundedIcon />, severity: "info" as const };
  const isEscalation = scenario.scenario === "C";
  const severity = scenario.scenario === "A" && requiresHuman ? "error" as const : display.severity;
  const palette = theme.palette[severity];

  return (
    <Card
      elevation={0}
      variant="outlined"
      sx={{ borderRadius: 2.5, borderLeft: `4px solid ${palette.main}`, height: "100%", display: "flex", flexDirection: "column" }}
    >
      <CardContent sx={{ p: "14px 16px !important", flex: 1, display: "flex", flexDirection: "column" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
          <Box sx={{ color: `${severity}.main`, display: "flex", flexShrink: 0 }}>
            {display.icon}
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="titleSmall" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              {scenario.scenario} — {scenario.titre}
            </Typography>
            <Typography variant="bodySmall" color="text.secondary">{scenario.description}</Typography>
          </Box>
          {taux !== null && scenario.scenario !== "C" && (
            <Box sx={{ px: 1, py: 0.25, borderRadius: 1.5, bgcolor: alpha(palette.main, 0.12), flexShrink: 0 }}>
              <Typography sx={{ fontSize: "0.875rem", fontWeight: 800, color: `${severity}.main` }}>
                {taux}%
              </Typography>
            </Box>
          )}
        </Box>

        <Box sx={{ mb: 1 }}>
          {scenario.avantages.split(".").filter(Boolean).map((pro) => (
            <Box key={pro} sx={{ display: "flex", alignItems: "flex-start", gap: 0.75, mb: 0.375 }}>
              <CheckRoundedIcon sx={{ fontSize: 14, color: "success.main", mt: "2px", flexShrink: 0 }} />
              <Typography variant="bodySmall">{pro.trim()}</Typography>
            </Box>
          ))}
        </Box>

        <Box sx={{ mb: 1.5 }}>
          {scenario.risques.split(".").filter(Boolean).map((con) => (
            <Box key={con} sx={{ display: "flex", alignItems: "flex-start", gap: 0.75, mb: 0.375 }}>
              <CloseRoundedIcon sx={{ fontSize: 14, color: "error.main", mt: "2px", flexShrink: 0 }} />
              <Typography variant="bodySmall" color="text.secondary">{con.trim()}</Typography>
            </Box>
          ))}
        </Box>

        {scenario.scenario === "A" && requiresHuman && (
          <Alert severity="error" sx={{ mb: 1.5, py: 0.25, "& .MuiAlert-message": { fontSize: "0.75rem" } }}>
            Validation humaine obligatoire — commission sous le plancher absolu
          </Alert>
        )}

        <Box sx={{ mt: "auto" }}>
          <Button
            variant={isEscalation ? "outlined" : "contained"}
            color={severity === "error" ? "error" : severity === "info" ? "inherit" : severity}
            size="small"
            fullWidth
            onClick={() => onValidate(scenario)}
            sx={{ fontWeight: 700, textTransform: "none" }}
          >
            Choisir le scénario {scenario.scenario}
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}

// ─── NegotiationProspectCard ──────────────────────────────────────────────────

function NegotiationProspectCard({
  prospect,
  selected,
  hasAnalysis,
  onSelect,
}: {
  prospect: Prospect;
  selected: boolean;
  hasAnalysis: boolean;
  onSelect: () => void;
}) {
  const theme = useTheme();
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

        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Typography variant="labelSmall" color="text.secondary">
            {prospect.commissionStandard}% std · {prospect.commissionPlancher}% plancher
          </Typography>
          <Chip
            label={hasAnalysis ? "Analyse dispo" : "Nouveau"}
            color={hasAnalysis ? "secondary" : "default"}
            size="small"
            sx={{ height: 18, fontSize: "0.5625rem", fontWeight: 700, "& .MuiChip-label": { px: 0.75 } }}
          />
        </Box>
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NegociationPage() {
  const { showSnackbar } = useSnackbar();
  const theme = useTheme();

  // ── Prospects ────────────────────────────────────────────────────
  const [prospects, setProspects]   = useState<Prospect[]>([]);
  const [loading, setLoading]       = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // ── Analysis (per selected prospect) ─────────────────────────────
  const [analysisCache, setAnalysisCache] = useState<Record<string, RawMessageAnalysis | null>>({});
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);

  // ── History dialog ────────────────────────────────────────────────
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyCache, setHistoryCache] = useState<Record<string, RawNegotiationMessage[]>>({});
  const [loadingHistory, setLoadingHistory] = useState(false);

  // ── Non-financial counterparts ────────────────────────────────────
  const [counterparts, setCounterparts] = useState<string[]>([]);

  // ── Confirm scenario ──────────────────────────────────────────────
  const [confirmScenario, setConfirmScenario] = useState<RawScenario | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function fetchProspects() {
    setLoading(true);
    setFetchError(null);
    try {
      const result = await prospectsApi.list({ stage: "negociation", pageSize: 100 });
      setProspects(result.items);
    } catch (err) {
      setFetchError(err instanceof ApiError ? err.detail : "Impossible de charger les prospects.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchProspects(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedId && prospects.length > 0) setSelectedId(prospects[0].id);
  }, [prospects, selectedId]);

  useEffect(() => {
    setCounterparts([]);
  }, [selectedId]);

  const selectedProspect = useMemo(
    () => prospects.find((p) => p.id === selectedId) ?? null,
    [selectedId, prospects],
  );

  // Load analysis when prospect is selected
  useEffect(() => {
    if (!selectedId) return;
    if (analysisCache[selectedId] !== undefined) return; // already loaded (null = no analysis, object = has analysis)

    setLoadingAnalysis(true);
    negotiationApi.analysis(selectedId)
      .then((analysis) => setAnalysisCache((prev) => ({ ...prev, [selectedId]: analysis })))
      .catch((err) => {
        // 404 = no analysis yet (normal state for new prospects)
        if (err instanceof ApiError && err.status === 404) {
          setAnalysisCache((prev) => ({ ...prev, [selectedId]: null }));
        } else {
          showSnackbar({ message: "Impossible de charger l'analyse.", severity: "error" });
          setAnalysisCache((prev) => ({ ...prev, [selectedId]: null }));
        }
      })
      .finally(() => setLoadingAnalysis(false));
  }, [selectedId, analysisCache, showSnackbar]);

  const analysis = selectedId ? (analysisCache[selectedId] ?? null) : null;

  // Load history when dialog opens
  async function openHistory() {
    if (!selectedId) return;
    setHistoryOpen(true);
    if (historyCache[selectedId] !== undefined) return;
    setLoadingHistory(true);
    try {
      const msgs = await negotiationApi.history(selectedId);
      setHistoryCache((prev) => ({ ...prev, [selectedId]: msgs }));
    } catch {
      setHistoryCache((prev) => ({ ...prev, [selectedId]: [] }));
    } finally {
      setLoadingHistory(false);
    }
  }

  function handleAnalysisReady(newAnalysis: RawMessageAnalysis) {
    if (!selectedId) return;
    setAnalysisCache((prev) => ({ ...prev, [selectedId]: newAnalysis }));
    // Invalidate history cache so it reloads next time
    setHistoryCache((prev) => {
      const next = { ...prev };
      delete next[selectedId];
      return next;
    });
  }

  const toggleCounterpart = useCallback((id: string) => {
    setCounterparts((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  async function handleConfirm() {
    if (!confirmScenario || !selectedId) return;
    setConfirming(true);
    try {
      await negotiationApi.respond(selectedId, confirmScenario.scenario as "A" | "B" | "C");
      showSnackbar({
        message: `Scénario ${confirmScenario.scenario} envoyé — réponse enregistrée.`,
        severity: confirmScenario.scenario === "C" ? "warning" : "success",
        duration: 5000,
      });
      // Invalidate analysis + history for this prospect so they reload
      setAnalysisCache((prev) => { const next = { ...prev }; delete next[selectedId]; return next; });
      setHistoryCache((prev) => { const next = { ...prev }; delete next[selectedId]; return next; });
      setConfirmScenario(null);
    } catch (err) {
      showSnackbar({
        message: err instanceof ApiError ? err.detail : "Erreur lors de l'envoi du scénario.",
        severity: "error",
      });
    } finally {
      setConfirming(false);
    }
  }

  // ── Derived stats ─────────────────────────────────────────────────
  const humanValidationCount = useMemo(
    () => Object.values(analysisCache).filter((a) => a?.requires_human).length,
    [analysisCache],
  );

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

        {loading ? (
          <Box sx={{ display: "flex", gap: 1 }}>
            {[100, 140].map((w) => (
              <Skeleton key={w} variant="rounded" width={w} height={30} sx={{ borderRadius: 4 }} />
            ))}
          </Box>
        ) : (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
            {[
              { label: "En négociation",     value: prospects.length,      color: "secondary" as const },
              { label: "Validation requise", value: humanValidationCount, color: "error" as const },
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
        <Box sx={{ width: { md: 340 }, flexShrink: 0, display: "flex", flexDirection: "column", gap: 1.5 }}>
          {loading ? (
            [1, 2, 3].map((i) => (
              <Skeleton key={i} variant="rounded" height={110} sx={{ borderRadius: 2.5 }} />
            ))
          ) : prospects.length === 0 ? (
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", py: 6, gap: 1, color: "text.disabled" }}>
              <InboxRoundedIcon sx={{ fontSize: 40 }} />
              <Typography variant="bodyMedium">Aucun prospect en négociation</Typography>
            </Box>
          ) : (
            prospects.map((p) => (
              <NegotiationProspectCard
                key={p.id}
                prospect={p}
                selected={selectedId === p.id}
                hasAnalysis={!!analysisCache[p.id]}
                onSelect={() => setSelectedId(p.id)}
              />
            ))
          )}
        </Box>

        {/* Right: analysis panel */}
        <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          {!selectedProspect ? (
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
          ) : loadingAnalysis ? (
            [1, 2].map((i) => (
              <Skeleton key={i} variant="rounded" height={i === 1 ? 180 : 120} sx={{ borderRadius: 2.5 }} />
            ))
          ) : !analysis ? (
            <SubmitMessagePanel prospect={selectedProspect} onAnalysisReady={handleAnalysisReady} />
          ) : (
            <>
              {/* VALIDATION HUMAINE banner */}
              {analysis.requires_human && (
                <Alert severity="error" icon={<WarningAmberRoundedIcon />}>
                  <AlertTitle>
                    <strong>VALIDATION HUMAINE REQUISE — {selectedProspect.nom}</strong>
                  </AlertTitle>
                  Commission demandée ({analysis.taux_demande ?? "—"}%) sous le plancher absolu ({selectedProspect.commissionPlancher}%) ou dossier signalé.
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
                    <Box sx={{ display: "flex", gap: 1 }}>
                      <Tooltip title="Soumettre un nouveau message" placement="top">
                        <IconButton
                          size="small"
                          onClick={() => setAnalysisCache((prev) => { const next = { ...prev }; delete next[selectedProspect.id]; return next; })}
                          sx={{ color: "text.secondary" }}
                        >
                          <AutoAwesomeRoundedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Historique des échanges" placement="top">
                        <IconButton
                          size="small"
                          onClick={openHistory}
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
                  </Box>

                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mb: 2 }}>
                    <Box>
                      <Typography variant="labelSmall" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                        Niveau d&apos;intérêt
                      </Typography>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        {(() => {
                          const { label, color } = intentDisplay(analysis.intent);
                          return (
                            <>
                              <Chip label={label} color={color} size="small" sx={{ fontWeight: 700 }} />
                              <Box sx={{ display: "flex", gap: 0.375 }}>
                                {Array.from({ length: 5 }).map((_, i) => (
                                  <Box
                                    key={i}
                                    sx={{
                                      width: 8, height: 8, borderRadius: "50%",
                                      bgcolor: i < (analysis.intent_score ?? 0)
                                        ? theme.palette[color].main
                                        : theme.palette.action.disabledBackground,
                                    }}
                                  />
                                ))}
                              </Box>
                            </>
                          );
                        })()}
                      </Box>
                    </Box>

                    {analysis.objection_type && (
                      <Box sx={{ flex: 1, minWidth: 180 }}>
                        <Typography variant="labelSmall" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                          Type d&apos;objection
                        </Typography>
                        <Chip
                          label={analysis.objection_type}
                          size="small"
                          variant="outlined"
                          icon={<GavelRoundedIcon sx={{ fontSize: "14px !important" }} />}
                          sx={{ fontWeight: 600 }}
                        />
                      </Box>
                    )}
                  </Box>

                  {analysis.objection_detail && (
                    <Typography variant="bodySmall" color="text.secondary" sx={{ fontStyle: "italic", mb: 2 }}>
                      {analysis.objection_detail}
                    </Typography>
                  )}

                  {/* Commission comparison */}
                  <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: "action.hover", display: "flex", gap: 2, flexWrap: "wrap" }}>
                    {[
                      { label: "Standard",          value: selectedProspect.commissionStandard, colorKey: "primary.main" },
                      { label: "Plancher absolu",   value: selectedProspect.commissionPlancher, colorKey: "error.main" },
                      ...(analysis.taux_demande != null ? [{
                        label: "Demande partenaire",
                        value: analysis.taux_demande,
                        colorKey:
                          analysis.taux_demande < selectedProspect.commissionPlancher
                            ? "error.main"
                            : analysis.taux_demande > selectedProspect.commissionStandard
                            ? "warning.main"
                            : "success.main",
                      }] : []),
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

                  {analysis.taux_demande != null && analysis.taux_demande < selectedProspect.commissionPlancher && (
                    <Alert severity="error" icon={<WarningAmberRoundedIcon fontSize="small" />} sx={{ mt: 1.5, "& .MuiAlert-message": { fontSize: "0.8125rem" } }}>
                      <strong>Commission sous le plancher absolu ({selectedProspect.commissionPlancher}%)</strong> — Tout accord à{" "}
                      {analysis.taux_demande}% nécessite une validation humaine avant toute réponse.
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
                    Référence pour la rédaction du Scénario B :
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
              {analysis.scenarios.length > 0 && (
                <Box>
                  <Typography variant="titleSmall" sx={{ fontWeight: 700, mb: 1.5 }}>
                    Scénarios de réponse — choisissez et validez
                  </Typography>
                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 2 }}>
                    {analysis.scenarios.map((s) => (
                      <ScenarioCard
                        key={s.scenario}
                        scenario={s}
                        requiresHuman={analysis.requires_human}
                        taux={analysis.taux_demande}
                        onValidate={setConfirmScenario}
                      />
                    ))}
                  </Box>
                </Box>
              )}
            </>
          )}
        </Box>
      </Box>

      <ConversationHistoryDialog
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        prospect={selectedProspect}
        messages={selectedId ? (historyCache[selectedId] ?? []) : []}
        loading={loadingHistory}
      />

      {confirmScenario && selectedProspect && (
        <ConfirmationDialog
          open
          onClose={() => { if (!confirming) setConfirmScenario(null); }}
          onConfirm={handleConfirm}
          title={`Valider le scénario ${confirmScenario.scenario} ?`}
          description={
            <Box>
              <Typography variant="bodyMedium" color="text.secondary" sx={{ mb: 1 }}>
                <strong>{confirmScenario.scenario} — {confirmScenario.titre}</strong>
              </Typography>
              <Typography variant="bodySmall" color="text.secondary" sx={{ mb: 1 }}>
                {confirmScenario.description}
              </Typography>
              {analysis?.requires_human && confirmScenario.scenario === "A" && (
                <Typography variant="bodySmall" color="error.main" sx={{ fontWeight: 600 }}>
                  ⚠ Validation humaine obligatoire avant toute réponse au partenaire.
                </Typography>
              )}
              {confirmScenario.scenario === "C" && (
                <Typography variant="bodySmall" color="warning.main" sx={{ fontWeight: 600 }}>
                  Ce scénario transmet le dossier au responsable commercial.
                </Typography>
              )}
            </Box>
          }
          confirmLabel={confirming ? "Envoi…" : `Valider scénario ${confirmScenario.scenario}`}
          confirmColor={analysis?.requires_human && confirmScenario.scenario === "A" ? "error" : "primary"}
        />
      )}
    </Box>
  );
}
