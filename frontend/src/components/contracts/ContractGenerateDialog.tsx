"use client";

import React, { useState } from "react";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Collapse from "@mui/material/Collapse";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Step from "@mui/material/Step";
import StepLabel from "@mui/material/StepLabel";
import Stepper from "@mui/material/Stepper";
import Typography from "@mui/material/Typography";
import { alpha, useTheme } from "@mui/material/styles";

import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import CloudDoneRoundedIcon from "@mui/icons-material/CloudDoneRounded";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import DoNotDisturbRoundedIcon from "@mui/icons-material/DoNotDisturbRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import HourglassTopRoundedIcon from "@mui/icons-material/HourglassTopRounded";
import MarkEmailReadRoundedIcon from "@mui/icons-material/MarkEmailReadRounded";
import PictureAsPdfRoundedIcon from "@mui/icons-material/PictureAsPdfRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import ThumbDownRoundedIcon from "@mui/icons-material/ThumbDownRounded";
import ThumbUpRoundedIcon from "@mui/icons-material/ThumbUpRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";

import { contractsApi, ApiError } from "@/lib/api";
import type { RawContract, RawContractClauses } from "@/lib/api";
import { useSnackbar } from "@/contexts/SnackbarContext";
import type { Prospect } from "@/types/prospect";
import { PARTNER_TYPE_LABELS } from "@/types/prospect";
import ConfirmationDialog from "@/components/shared/ConfirmationDialog";

// ─── Constants ────────────────────────────────────────────────────────────────

const IS_DEV = process.env.NEXT_PUBLIC_ENV !== "production";

const STEPS = ["Réviser", "PDF généré", "Envoyé", "Résultat"];

const CLAUSE_LABELS: Record<keyof RawContractClauses, string> = {
  parties: "1. Parties contractantes",
  objet: "2. Objet du partenariat",
  commission_clause: "3. Commission et paiement",
  obligations_bab: "4. Obligations Bab Morocco",
  obligations_partner: "5. Obligations du partenaire",
  duree_clause: "6. Durée et résiliation",
  confidentialite: "7. Confidentialité et PI",
  rgpd_clause: "8. Protection des données",
  juridiction: "9. Droit applicable",
  post_signature_note: "Activation post-signature",
};

function statusToStep(status: RawContract["status"]): number {
  switch (status) {
    case "draft":           return 0;
    case "generated":       return 1;
    case "sent_to_partner": return 2;
    case "signed":
    case "declined":        return 3;
  }
}

// ─── ClauseAccordion ─────────────────────────────────────────────────────────

function ClauseAccordion({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false);
  const theme = useTheme();
  return (
    <Box sx={{ border: `1px solid ${theme.palette.divider}`, borderRadius: 2, overflow: "hidden" }}>
      <Box
        onClick={() => setOpen((v) => !v)}
        sx={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          px: 1.5, py: 1, cursor: "pointer", bgcolor: "action.hover",
          "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.05) },
          userSelect: "none",
        }}
      >
        <Typography variant="labelSmall" sx={{ fontWeight: 700, fontSize: "0.75rem" }}>{label}</Typography>
        <ExpandMoreRoundedIcon sx={{
          fontSize: 18, color: "text.secondary",
          transform: open ? "rotate(180deg)" : "rotate(0deg)",
          transition: "transform 200ms ease",
        }} />
      </Box>
      <Collapse in={open}>
        <Box sx={{ px: 1.5, py: 1.25, borderTop: `1px solid ${theme.palette.divider}` }}>
          {text.split("\n\n").map((para, i) => (
            <Typography key={i} variant="bodySmall" color="text.secondary"
              sx={{ display: "block", lineHeight: 1.65, mb: i < text.split("\n\n").length - 1 ? 1 : 0, fontSize: "0.78125rem" }}>
              {para}
            </Typography>
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}

// ─── Step panels ─────────────────────────────────────────────────────────────

function DraftPanel({
  contract, prospect, onGenerate, generating,
}: {
  contract: RawContract;
  prospect: Prospect;
  onGenerate: () => void;
  generating: boolean;
}) {
  const theme = useTheme();
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {contract.human_review_required && (
        <Alert severity="error" icon={<WarningAmberRoundedIcon />} sx={{ borderRadius: 2 }}>
          <Typography variant="bodySmall" sx={{ fontWeight: 700 }}>Validation humaine requise</Typography>
          <Typography variant="bodySmall" sx={{ display: "block", mt: 0.25 }}>
            {contract.human_review_reason}
          </Typography>
          <Typography variant="bodySmall" sx={{ display: "block", mt: 0.5, fontStyle: "italic" }}>
            La génération PDF est bloquée jusqu&apos;à validation par le responsable commercial.
          </Typography>
        </Alert>
      )}

      {/* Partner summary */}
      <Box sx={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5,
        p: 2, borderRadius: 2.5, bgcolor: "action.hover",
        border: `1px solid ${theme.palette.divider}`,
      }}>
        {[
          { label: "Partenaire",  value: contract.partner_name },
          { label: "Pays",        value: contract.country },
          { label: "Type",        value: PARTNER_TYPE_LABELS[prospect.type] ?? contract.partner_type },
          { label: "Commission",  value: `${contract.commission}%` },
          { label: "Email",       value: contract.partner_email ?? "—" },
          { label: "Langue",      value: contract.language.toUpperCase() },
        ].map(({ label, value }) => (
          <Box key={label}>
            <Typography variant="labelSmall" color="text.secondary" sx={{ display: "block", mb: 0.25 }}>{label}</Typography>
            <Typography variant="bodySmall" sx={{ fontWeight: 600 }}>{value}</Typography>
          </Box>
        ))}
      </Box>

      {/* 9-clause checklist */}
      <Box>
        <Typography variant="titleSmall" sx={{ fontWeight: 700, mb: 1 }}>
          Structure du contrat (9 clauses)
        </Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
          {Object.entries(CLAUSE_LABELS).map(([, label]) => (
            <Box key={label} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <CheckCircleRoundedIcon sx={{ fontSize: 16, color: "success.main", flexShrink: 0 }} />
              <Typography variant="bodySmall" color="text.secondary">{label}</Typography>
            </Box>
          ))}
        </Box>
      </Box>

      <Divider />

      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <Typography variant="bodySmall" color="text.secondary">
          L&apos;IA va rédiger l&apos;intégralité des clauses dans la langue du partenaire ({contract.language.toUpperCase()}),
          puis générer un PDF professionnel prêt à envoyer.
        </Typography>
        <Button
          variant="contained"
          disableElevation
          startIcon={generating ? <CircularProgress size={16} color="inherit" /> : <PictureAsPdfRoundedIcon />}
          onClick={onGenerate}
          disabled={generating || contract.human_review_required}
          sx={{ fontWeight: 700, textTransform: "none", alignSelf: "flex-start" }}
        >
          {generating ? "Génération en cours…" : "Générer le PDF"}
        </Button>
        {generating && (
          <Typography variant="bodySmall" color="text.secondary" sx={{ fontStyle: "italic" }}>
            <AutoAwesomeRoundedIcon sx={{ fontSize: 14, verticalAlign: "middle", mr: 0.5 }} />
            L&apos;IA rédige les clauses et compile le PDF…
          </Typography>
        )}
      </Box>
    </Box>
  );
}

function GeneratedPanel({
  contract, onSend, sending,
}: {
  contract: RawContract;
  onSend: () => void;
  sending: boolean;
}) {
  const theme = useTheme();
  const clauses = contract.clauses;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {/* PDF ready banner */}
      <Box sx={{
        display: "flex", alignItems: "center", gap: 1.5, p: 1.5, borderRadius: 2,
        bgcolor: alpha(theme.palette.success.main, 0.08),
        border: `1px solid ${alpha(theme.palette.success.main, 0.25)}`,
      }}>
        <PictureAsPdfRoundedIcon sx={{ color: "success.main", fontSize: 28, flexShrink: 0 }} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="titleSmall" sx={{ fontWeight: 700, color: "success.main" }}>
            PDF généré avec succès
          </Typography>
          <Typography variant="bodySmall" color="text.secondary">
            Contrat pour {contract.partner_name} · Commission {contract.commission}%
          </Typography>
        </Box>
        <Button
          size="small"
          variant="outlined"
          color="success"
          startIcon={<DownloadRoundedIcon />}
          component="a"
          href={contractsApi.pdfDownloadUrl(contract.id)}
          target="_blank"
          rel="noopener noreferrer"
          sx={{ fontWeight: 700, textTransform: "none", flexShrink: 0 }}
        >
          Télécharger
        </Button>
      </Box>

      {/* Clause review (collapsible) */}
      {clauses && (
        <Box>
          <Typography variant="titleSmall" sx={{ fontWeight: 700, mb: 1 }}>
            Réviser les clauses générées
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.625 }}>
            {(Object.keys(CLAUSE_LABELS) as Array<keyof RawContractClauses>).map((key) => (
              <ClauseAccordion key={key} label={CLAUSE_LABELS[key]} text={clauses[key] ?? ""} />
            ))}
          </Box>
        </Box>
      )}

      <Divider />

      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <Typography variant="bodySmall" color="text.secondary">
          Le PDF va être envoyé à <strong>{contract.partner_email ?? contract.partner_name}</strong> avec
          une demande de signature. Vous serez notifié dès que le partenaire aura signé ou décliné.
        </Typography>
        <Button
          variant="contained"
          disableElevation
          color="primary"
          startIcon={sending ? <CircularProgress size={16} color="inherit" /> : <SendRoundedIcon />}
          onClick={onSend}
          disabled={sending}
          sx={{ fontWeight: 700, textTransform: "none", alignSelf: "flex-start" }}
        >
          {sending ? "Envoi en cours…" : "Envoyer au partenaire"}
        </Button>
      </Box>
    </Box>
  );
}

function SentPanel({
  contract, prospect, onMarkSigned, onMarkDeclined, onSimulateSigned, actioning,
}: {
  contract: RawContract;
  prospect: Prospect;
  onMarkSigned: () => void;
  onMarkDeclined: () => void;
  onSimulateSigned: () => void;
  actioning: boolean;
}) {
  const theme = useTheme();
  const sentDate = contract.sent_at
    ? new Date(contract.sent_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    : "—";
  const daysSince = contract.sent_at
    ? Math.floor((Date.now() - new Date(contract.sent_at).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {/* Status */}
      <Box sx={{
        display: "flex", alignItems: "center", gap: 1.5, p: 1.5, borderRadius: 2,
        bgcolor: alpha(theme.palette.warning.main, 0.08),
        border: `1px solid ${alpha(theme.palette.warning.main, 0.25)}`,
      }}>
        <HourglassTopRoundedIcon sx={{ color: "warning.main", fontSize: 26, flexShrink: 0 }} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="titleSmall" sx={{ fontWeight: 700, color: "warning.dark" }}>
            En attente de signature
          </Typography>
          <Typography variant="bodySmall" color="text.secondary">
            Envoyé le {sentDate} à {contract.partner_email ?? prospect.nomContact}
            {daysSince > 0 && ` · ${daysSince} jour${daysSince > 1 ? "s" : ""} d'attente`}
          </Typography>
        </Box>
        <Button
          size="small"
          variant="outlined"
          startIcon={<DownloadRoundedIcon />}
          component="a"
          href={contractsApi.pdfDownloadUrl(contract.id)}
          target="_blank"
          rel="noopener noreferrer"
          sx={{ fontWeight: 600, textTransform: "none", flexShrink: 0, fontSize: "0.75rem" }}
        >
          PDF
        </Button>
      </Box>

      {/* Inbox monitoring reminder */}
      <Alert severity="info" icon={<MarkEmailReadRoundedIcon />} sx={{ borderRadius: 2 }}>
        <Typography variant="bodySmall">
          Surveillez votre boîte email pour la réponse de <strong>{prospect.nom}</strong>.
          Dès qu&apos;il répond (signé ou refusé), marquez le résultat ci-dessous.
        </Typography>
      </Alert>

      <Divider />

      {/* Action buttons */}
      <Typography variant="titleSmall" sx={{ fontWeight: 700 }}>
        Le partenaire a répondu ?
      </Typography>
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
        <Button
          variant="contained"
          disableElevation
          color="success"
          startIcon={actioning ? <CircularProgress size={16} color="inherit" /> : <ThumbUpRoundedIcon />}
          onClick={onMarkSigned}
          disabled={actioning}
          sx={{ fontWeight: 700, textTransform: "none" }}
        >
          Marquer comme signé
        </Button>
        <Button
          variant="outlined"
          color="error"
          startIcon={actioning ? <CircularProgress size={16} color="inherit" /> : <ThumbDownRoundedIcon />}
          onClick={onMarkDeclined}
          disabled={actioning}
          sx={{ fontWeight: 700, textTransform: "none" }}
        >
          Marquer comme refusé
        </Button>
      </Box>

      {IS_DEV && (
        <Box sx={{ pt: 0.5 }}>
          <Chip
            label={actioning ? "Simulation…" : "[DEV] Simuler signature partenaire →"}
            size="small"
            color="warning"
            variant="outlined"
            onClick={actioning ? undefined : onSimulateSigned}
            icon={actioning ? <CircularProgress size={10} color="inherit" /> : undefined}
            sx={{
              height: 22, fontSize: "0.5625rem", fontWeight: 700,
              cursor: actioning ? "default" : "pointer",
              borderStyle: "dashed",
              "& .MuiChip-label": { px: 1 },
            }}
          />
        </Box>
      )}
    </Box>
  );
}

function ResultPanel({ contract }: { contract: RawContract }) {
  const theme = useTheme();
  const isSigned = contract.status === "signed";
  const color = isSigned ? theme.palette.success : theme.palette.error;
  const date = isSigned
    ? contract.signed_at && new Date(contract.signed_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    : contract.declined_at && new Date(contract.declined_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Box sx={{
        display: "flex", alignItems: "center", gap: 2, p: 2.5, borderRadius: 2.5,
        bgcolor: alpha(color.main, 0.08),
        border: `1px solid ${alpha(color.main, 0.25)}`,
      }}>
        {isSigned
          ? <CloudDoneRoundedIcon sx={{ color: "success.main", fontSize: 40, flexShrink: 0 }} />
          : <DoNotDisturbRoundedIcon sx={{ color: "error.main", fontSize: 40, flexShrink: 0 }} />
        }
        <Box>
          <Typography variant="titleMedium" sx={{ fontWeight: 700, color: isSigned ? "success.main" : "error.main" }}>
            {isSigned ? "Contrat signé — Partenaire actif ✓" : "Contrat refusé — Retour en négociation"}
          </Typography>
          <Typography variant="bodySmall" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
            {isSigned
              ? `Signé le ${date} · Le partenaire est désormais actif sur babmorocco.com`
              : `Refusé le ${date} · Le prospect a été remis en phase de négociation`
            }
          </Typography>
        </Box>
      </Box>

      {isSigned && (
        <Alert severity="success" icon={<CloudDoneRoundedIcon />} sx={{ borderRadius: 2 }}>
          <Typography variant="bodySmall" sx={{ fontWeight: 700 }}>Webhook OTA — Activation en cours</Typography>
          <Typography variant="bodySmall" sx={{ display: "block", mt: 0.25 }}>
            Le connecteur babmorocco.com sera déclenché automatiquement dans les 60 minutes
            suivant la signature. (Phase 2 : activation instantanée via YouSign webhook)
          </Typography>
        </Alert>
      )}
    </Box>
  );
}

// ─── Main dialog ─────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  prospect: Prospect;
  contract: RawContract;
  onContractUpdate: (contract: RawContract) => void;
}

export default function ContractGenerateDialog({
  open, onClose, prospect, contract, onContractUpdate,
}: Props) {
  const { showSnackbar } = useSnackbar();

  const [generating, setGenerating]     = useState(false);
  const [sending, setSending]           = useState(false);
  const [actioning, setActioning]       = useState(false);
  const [confirmSign, setConfirmSign]   = useState(false);
  const [confirmDecline, setConfirmDecline] = useState(false);

  const activeStep = statusToStep(contract.status);

  // ── Generate PDF ──────────────────────────────────────────────────

  async function handleGenerate() {
    setGenerating(true);
    try {
      const updated = await contractsApi.generate(contract.id);
      onContractUpdate(updated);
      showSnackbar({ message: "PDF généré avec succès.", severity: "success" });
    } catch (err) {
      showSnackbar({
        message: err instanceof ApiError ? err.detail : "Erreur lors de la génération.",
        severity: "error",
      });
    } finally {
      setGenerating(false);
    }
  }

  // ── Send ──────────────────────────────────────────────────────────

  async function handleSend() {
    setSending(true);
    try {
      const updated = await contractsApi.send(contract.id);
      onContractUpdate(updated);
      showSnackbar({ message: `Contrat envoyé à ${prospect.nomContact}.`, severity: "success" });
    } catch (err) {
      showSnackbar({
        message: err instanceof ApiError ? err.detail : "Erreur lors de l'envoi.",
        severity: "error",
      });
    } finally {
      setSending(false);
    }
  }

  // ── Mark signed ───────────────────────────────────────────────────

  async function handleMarkSigned() {
    setConfirmSign(false);
    setActioning(true);
    try {
      const updated = await contractsApi.markSigned(contract.id);
      onContractUpdate(updated);
      showSnackbar({
        message: `Contrat signé — ${prospect.nom} est maintenant un partenaire actif.`,
        severity: "success",
        duration: 7000,
      });
    } catch (err) {
      showSnackbar({
        message: err instanceof ApiError ? err.detail : "Erreur lors de la validation.",
        severity: "error",
      });
    } finally {
      setActioning(false);
    }
  }

  // ── Mark declined ─────────────────────────────────────────────────

  async function handleMarkDeclined() {
    setConfirmDecline(false);
    setActioning(true);
    try {
      const updated = await contractsApi.markDeclined(contract.id);
      onContractUpdate(updated);
      showSnackbar({
        message: `Contrat refusé — ${prospect.nom} retourne en négociation.`,
        severity: "warning",
        duration: 5000,
      });
    } catch (err) {
      showSnackbar({
        message: err instanceof ApiError ? err.detail : "Erreur lors du marquage.",
        severity: "error",
      });
    } finally {
      setActioning(false);
    }
  }

  // ── Simulate signed (DEV) ─────────────────────────────────────────

  async function handleSimulateSigned() {
    setActioning(true);
    try {
      const updated = await contractsApi.simulateSigned(contract.id);
      onContractUpdate(updated);
      showSnackbar({ message: "[DEV] Signature simulée — partenaire activé.", severity: "info" });
    } catch (err) {
      showSnackbar({
        message: err instanceof ApiError ? err.detail : "Erreur lors de la simulation.",
        severity: "error",
      });
    } finally {
      setActioning(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────

  const isDone = contract.status === "signed" || contract.status === "declined";

  return (
    <>
      <Dialog
        open={open}
        onClose={isDone || !generating && !sending && !actioning ? onClose : undefined}
        maxWidth="sm"
        fullWidth
        scroll="paper"
        PaperProps={{ sx: { borderRadius: 3, maxHeight: "92dvh" } }}
      >
        {/* Header */}
        <DialogTitle sx={{ display: "flex", alignItems: "flex-start", gap: 1.5, pb: 1.5, borderBottom: 1, borderColor: "divider" }}>
          <Box sx={{
            width: 40, height: 40, borderRadius: 2,
            bgcolor: alpha("#B5451B", 0.1),
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, mt: 0.25,
          }}>
            <DescriptionOutlinedIcon sx={{ color: "primary.main", fontSize: 22 }} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="titleMedium" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
              Contrat de partenariat
            </Typography>
            <Typography variant="bodySmall" color="text.secondary" noWrap>
              {contract.partner_name}
            </Typography>
          </Box>
          <IconButton
            size="small"
            onClick={onClose}
            disabled={generating || sending || actioning}
            sx={{ flexShrink: 0, mt: 0.25 }}
          >
            <CloseRoundedIcon fontSize="small" />
          </IconButton>
        </DialogTitle>

        {/* Stepper */}
        <Box sx={{ px: 3, pt: 2, pb: 1 }}>
          <Stepper activeStep={activeStep} alternativeLabel>
            {STEPS.map((label, i) => (
              <Step key={label} completed={i < activeStep}>
                <StepLabel
                  StepIconProps={{
                    sx: {
                      "& .MuiStepIcon-root": { fontSize: 22 },
                      "& .MuiStepIcon-text": { fontSize: "0.6rem" },
                    },
                  }}
                >
                  <Typography variant="labelSmall" sx={{ fontSize: "0.6875rem" }}>{label}</Typography>
                </StepLabel>
              </Step>
            ))}
          </Stepper>
        </Box>

        <DialogContent sx={{ px: 3, py: 2 }}>
          {contract.status === "draft" && (
            <DraftPanel
              contract={contract}
              prospect={prospect}
              onGenerate={handleGenerate}
              generating={generating}
            />
          )}
          {contract.status === "generated" && (
            <GeneratedPanel
              contract={contract}
              onSend={handleSend}
              sending={sending}
            />
          )}
          {contract.status === "sent_to_partner" && (
            <SentPanel
              contract={contract}
              prospect={prospect}
              onMarkSigned={() => setConfirmSign(true)}
              onMarkDeclined={() => setConfirmDecline(true)}
              onSimulateSigned={handleSimulateSigned}
              actioning={actioning}
            />
          )}
          {(contract.status === "signed" || contract.status === "declined") && (
            <ResultPanel contract={contract} />
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button
            onClick={onClose}
            variant={isDone ? "contained" : "text"}
            disableElevation
            disabled={generating || sending || actioning}
            endIcon={isDone ? undefined : <ChevronRightRoundedIcon sx={{ fontSize: 16 }} />}
            sx={{ fontWeight: 600, textTransform: "none" }}
          >
            {isDone ? "Fermer" : "Fermer"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirm signed */}
      <ConfirmationDialog
        open={confirmSign}
        onClose={() => setConfirmSign(false)}
        onConfirm={handleMarkSigned}
        title="Confirmer la signature du partenaire"
        description={
          <Typography variant="bodyMedium">
            Confirmez-vous que <strong>{prospect.nom}</strong> a signé le contrat ?
            <br /><br />
            Le prospect sera automatiquement promu au stade{" "}
            <strong>Activation OTA</strong>.
          </Typography>
        }
        confirmLabel="Confirmer la signature"
        confirmColor="success"
      />

      {/* Confirm declined */}
      <ConfirmationDialog
        open={confirmDecline}
        onClose={() => setConfirmDecline(false)}
        onConfirm={handleMarkDeclined}
        title="Marquer le contrat comme refusé ?"
        description={
          <Typography variant="bodyMedium">
            Le contrat sera marqué <strong>Refusé</strong> et{" "}
            <strong>{prospect.nom}</strong> retournera en phase de négociation.
          </Typography>
        }
        confirmLabel="Marquer comme refusé"
        confirmColor="error"
      />
    </>
  );
}
