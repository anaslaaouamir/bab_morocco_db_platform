"use client";

import React, { useState, useCallback, useEffect, useMemo } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Tooltip from "@mui/material/Tooltip";
import Skeleton from "@mui/material/Skeleton";
import { alpha, useTheme } from "@mui/material/styles";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import HourglassTopRoundedIcon from "@mui/icons-material/HourglassTopRounded";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import CloudDoneRoundedIcon from "@mui/icons-material/CloudDoneRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import PictureAsPdfRoundedIcon from "@mui/icons-material/PictureAsPdfRounded";
import DrawRoundedIcon from "@mui/icons-material/DrawRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import DoNotDisturbRoundedIcon from "@mui/icons-material/DoNotDisturbRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import InboxRoundedIcon from "@mui/icons-material/InboxRounded";
import Link from "next/link";

import type { Prospect } from "@/types/prospect";
import { PARTNER_TYPE_LABELS, LANGUAGE_FLAGS } from "@/types/prospect";
import type { RawContract } from "@/lib/api";
import { contractsApi, prospectsApi, ApiError } from "@/lib/api";
import { rawToProspect } from "@/lib/api";
import ProspectDrawer from "@/components/crm/ProspectDrawer";
import ContractGenerateDialog from "@/components/contracts/ContractGenerateDialog";
import { useSnackbar } from "@/contexts/SnackbarContext";

// ─── Status helpers ───────────────────────────────────────────────────────────

type StatusInfo = {
  label: string;
  description: string;
  chipColor: "default" | "info" | "warning" | "success" | "error";
  icon: React.ReactNode;
  accentColor: string;
};

function useStatusInfo(contract: RawContract): StatusInfo {
  const theme = useTheme();
  switch (contract.status) {
    case "signed":
      return {
        label: "Signé & actif",
        description: "Contrat signé · Partenaire actif sur babmorocco.com",
        chipColor: "success",
        icon: <CheckCircleRoundedIcon fontSize="small" />,
        accentColor: theme.palette.success.main,
      };
    case "sent_to_partner":
      return {
        label: "En attente signature",
        description: "Contrat envoyé · En attente de réponse du partenaire",
        chipColor: "warning",
        icon: <HourglassTopRoundedIcon fontSize="small" />,
        accentColor: theme.palette.warning.main,
      };
    case "generated":
      return {
        label: "PDF généré",
        description: "Contrat prêt · En attente envoi au partenaire",
        chipColor: "info",
        icon: <PictureAsPdfRoundedIcon fontSize="small" />,
        accentColor: theme.palette.info.main,
      };
    case "declined":
      return {
        label: "Refusé",
        description: "Partenaire a refusé · Retourné en négociation",
        chipColor: "error",
        icon: <DoNotDisturbRoundedIcon fontSize="small" />,
        accentColor: theme.palette.error.main,
      };
    default: // draft
      return {
        label: "À préparer",
        description: "Accord en cours · PDF non encore généré",
        chipColor: "default",
        icon: <DrawRoundedIcon fontSize="small" />,
        accentColor: theme.palette.text.disabled,
      };
  }
}

// ─── ContractCard ─────────────────────────────────────────────────────────────

function ContractCard({
  contract, prospect,
  onOpenFiche, onOpenDialog,
}: {
  contract: RawContract;
  prospect: Prospect;
  onOpenFiche: (p: Prospect) => void;
  onOpenDialog: (c: RawContract, p: Prospect) => void;
}) {
  const theme = useTheme();
  const info = useStatusInfo(contract);

  const sentDate = contract.sent_at
    ? new Date(contract.sent_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
    : null;
  const signedDate = contract.signed_at
    ? new Date(contract.signed_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })
    : null;

  // Label for the primary action button (null = no button, just open dialog on status chip click)
  const actionLabel = (() => {
    if (contract.status === "signed" || contract.status === "declined") return null;
    if (contract.status === "sent_to_partner") return null; // replaced by status chip below
    if (contract.status === "generated") return "Envoyer au partenaire";
    return "Générer le contrat";
  })();

  // For sent_to_partner: show a clickable status chip instead of a button
  const sentStatusChip = contract.status === "sent_to_partner" ? (
    contract.partner_reply
      ? { label: "Réponse reçue", color: "success" as const }
      : { label: "En attente de réponse", color: "warning" as const }
  ) : null;

  return (
    <Card
      elevation={0}
      variant="outlined"
      sx={{
        borderRadius: 3,
        overflow: "hidden",
        borderColor: contract.status === "signed"
          ? alpha(theme.palette.success.main, 0.4)
          : contract.status === "declined"
          ? alpha(theme.palette.error.main, 0.3)
          : "divider",
      }}
    >
      {/* Status accent strip */}
      <Box sx={{ height: 4, bgcolor: info.accentColor }} />

      <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>

        {/* Header row */}
        <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5, mb: 1.5 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", mb: 0.5 }}>
              <Typography variant="titleSmall" sx={{ fontWeight: 700 }}>{contract.partner_name}</Typography>
              <Chip
                icon={info.icon as React.ReactElement}
                label={info.label}
                color={info.chipColor}
                size="small"
                sx={{ fontWeight: 700, fontSize: "0.6875rem" }}
              />
              {contract.human_review_required && (
                <Tooltip
                  title={contract.human_review_reason ?? "Validation humaine requise"}
                  placement="top"
                  arrow
                >
                  <Chip
                    icon={<WarningAmberRoundedIcon sx={{ fontSize: "14px !important" }} />}
                    label="Validation humaine"
                    color="error"
                    size="small"
                    variant="outlined"
                    sx={{ fontWeight: 700, fontSize: "0.6875rem" }}
                  />
                </Tooltip>
              )}
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
              <Chip
                label={PARTNER_TYPE_LABELS[prospect.type] ?? contract.partner_type}
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
              {contract.commission}%
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

        {/* Signed banner */}
        {contract.status === "signed" && (
          <Box sx={{
            display: "flex", alignItems: "center", gap: 1, p: 1.25, borderRadius: 2, mb: 1.5,
            bgcolor: alpha(theme.palette.success.main, 0.07),
            border: `1px solid ${alpha(theme.palette.success.main, 0.2)}`,
          }}>
            <CloudDoneRoundedIcon sx={{ color: "success.main", fontSize: 18, flexShrink: 0 }} />
            <Box sx={{ flex: 1 }}>
              <Typography variant="labelSmall" sx={{ fontWeight: 700, color: "success.main", display: "block" }}>
                Partenaire actif ✓
              </Typography>
              <Typography variant="bodySmall" color="text.secondary" sx={{ fontSize: "0.6875rem" }}>
                {signedDate && `Signé le ${signedDate}`}
              </Typography>
            </Box>
            <Chip label="Actif babmorocco.com" color="success" size="small"
              sx={{ fontWeight: 700, fontSize: "0.625rem", "& .MuiChip-label": { px: 0.75 } }} />
          </Box>
        )}

        {/* Awaiting banner */}
        {contract.status === "sent_to_partner" && (
          <Box sx={{
            display: "flex", alignItems: "center", gap: 1, p: 1.25, borderRadius: 2, mb: 1.5,
            bgcolor: alpha(theme.palette.warning.main, 0.07),
            border: `1px solid ${alpha(theme.palette.warning.main, 0.2)}`,
          }}>
            <SendRoundedIcon sx={{ color: "warning.main", fontSize: 18, flexShrink: 0 }} />
            <Box>
              <Typography variant="labelSmall" sx={{ fontWeight: 700, color: "warning.main", display: "block" }}>
                En attente de réponse
              </Typography>
              <Typography variant="bodySmall" color="text.secondary" sx={{ fontSize: "0.6875rem" }}>
                {sentDate ? `Envoyé le ${sentDate}` : "Surveiller la boîte de réception"}
                {prospect.emailContact && ` · ${prospect.emailContact}`}
              </Typography>
            </Box>
          </Box>
        )}

        {/* Declined banner */}
        {contract.status === "declined" && (
          <Box sx={{
            display: "flex", alignItems: "center", gap: 1, p: 1.25, borderRadius: 2, mb: 1.5,
            bgcolor: alpha(theme.palette.error.main, 0.07),
            border: `1px solid ${alpha(theme.palette.error.main, 0.2)}`,
          }}>
            <DoNotDisturbRoundedIcon sx={{ color: "error.main", fontSize: 18, flexShrink: 0 }} />
            <Typography variant="bodySmall" color="text.secondary" sx={{ fontSize: "0.6875rem" }}>
              Refusé · Le prospect a été remis en négociation
            </Typography>
          </Box>
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

          {actionLabel && (
            <Button
              size="small"
              variant="contained"
              disableElevation
              startIcon={<PictureAsPdfRoundedIcon />}
              onClick={() => onOpenDialog(contract, prospect)}
              sx={{ fontWeight: 600, textTransform: "none", borderRadius: 2 }}
            >
              {actionLabel}
            </Button>
          )}

          {sentStatusChip && (
            <Chip
              label={sentStatusChip.label}
              color={sentStatusChip.color}
              size="small"
              icon={sentStatusChip.color === "success"
                ? <CheckCircleRoundedIcon sx={{ fontSize: "14px !important" }} />
                : <HourglassTopRoundedIcon sx={{ fontSize: "14px !important" }} />}
              onClick={() => onOpenDialog(contract, prospect)}
              sx={{ fontWeight: 700, fontSize: "0.6875rem", cursor: "pointer" }}
            />
          )}

          {contract.has_pdf && (
            <Tooltip title="Télécharger le PDF">
              <Button
                size="small"
                variant="text"
                startIcon={<PictureAsPdfRoundedIcon sx={{ fontSize: 14 }} />}
                component="a"
                href={contractsApi.pdfDownloadUrl(contract.id)}
                target="_blank"
                rel="noopener noreferrer"
                sx={{ fontWeight: 600, textTransform: "none", fontSize: "0.75rem" }}
              >
                PDF
              </Button>
            </Tooltip>
          )}

          {contract.status === "signed" && prospect.adresseWeb && (
            <Button
              size="small"
              variant="text"
              endIcon={<OpenInNewRoundedIcon sx={{ fontSize: 14 }} />}
              href={prospect.adresseWeb.startsWith("http") ? prospect.adresseWeb : `https://${prospect.adresseWeb}`}
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ContratsPage() {
  const theme = useTheme();
  const { showSnackbar } = useSnackbar();

  // Data
  const [contracts, setContracts] = useState<RawContract[]>([]);
  const [prospectsMap, setProspectsMap] = useState<Record<string, Prospect>>({});
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Fiche drawer
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Contract dialog
  const [dialogContract, setDialogContract] = useState<RawContract | null>(null);
  const [dialogProspect, setDialogProspect] = useState<Prospect | null>(null);

  // ── Fetch ───────────────────────────────────────────────────────

  async function fetchData() {
    setLoading(true);
    setFetchError(null);
    try {
      const [contractsRes, closingRes, activationRes] = await Promise.all([
        contractsApi.list(),
        prospectsApi.list({ stage: "closing", pageSize: 100 }),
        prospectsApi.list({ stage: "activation_ota", pageSize: 100 }),
      ]);

      setContracts(contractsRes.items);

      // Build a map of prospect_id → Prospect for O(1) lookup
      const map: Record<string, Prospect> = {};
      for (const p of [...closingRes.items, ...activationRes.items]) {
        map[p.id] = p;
      }
      // Also include prospects from contracts whose prospect_id may be in negociation (declined)
      // We'll fetch those lazily — for now mark as unknown if not found
      setProspectsMap(map);
    } catch (err) {
      setFetchError(err instanceof ApiError ? err.detail : "Impossible de charger les contrats.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ────────────────────────────────────────────────────

  const handleOpenFiche = useCallback((p: Prospect) => {
    setSelectedProspect(p);
    setDrawerOpen(true);
  }, []);

  const handleOpenDialog = useCallback((c: RawContract, p: Prospect) => {
    setDialogContract(c);
    setDialogProspect(p);
  }, []);

  const handleContractUpdate = useCallback((updated: RawContract) => {
    setContracts((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    setDialogContract(updated);

    // If signed → prospect stage changed to activation_ota; refresh prospect list
    if (updated.status === "signed" || updated.status === "declined") {
      fetchData();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStageChange = useCallback((id: string, newStage: import("@/types/prospect").PipelineStage) => {
    setProspectsMap((prev) => prev[id] ? { ...prev, [id]: { ...prev[id], stage: newStage } } : prev);
    showSnackbar({ message: "Étape mise à jour", severity: "success", duration: 3000 });
  }, [showSnackbar]);

  const handleNotesChange = useCallback((id: string, notes: string) => {
    setProspectsMap((prev) => prev[id] ? { ...prev, [id]: { ...prev[id], notes } } : prev);
    showSnackbar({ message: "Note enregistrée", severity: "info", duration: 2500 });
  }, [showSnackbar]);

  // ── Derived data ────────────────────────────────────────────────

  // Only show contracts where we have the prospect data
  const enriched = useMemo(() =>
    contracts
      .filter((c) => prospectsMap[c.prospect_id])
      .map((c) => ({ contract: c, prospect: prospectsMap[c.prospect_id] })),
    [contracts, prospectsMap],
  );

  const signed    = enriched.filter(({ contract: c }) => c.status === "signed");
  const inProgress = enriched.filter(({ contract: c }) => ["draft", "generated", "sent_to_partner"].includes(c.status));
  const declined  = enriched.filter(({ contract: c }) => c.status === "declined");

  const avgCommission = enriched.length
    ? Math.round(enriched.reduce((s, { contract: c }) => s + c.commission, 0) / enriched.length * 10) / 10
    : 0;

  // ─────────────────────────────────────────────────────────────────

  return (
    <Box sx={{ px: { xs: 2, sm: 3, md: 4 }, py: { xs: 2, md: 3 }, display: "flex", flexDirection: "column", gap: 3 }}>

      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
        <Box>
          <Typography variant="headlineMedium" component="h1" sx={{ mb: 0.5 }}>Contrats</Typography>
          <Typography variant="bodyMedium" color="text.secondary">
            Génération PDF · Envoi partenaire · Suivi signature · Activation OTA
          </Typography>
        </Box>
        <Button
          variant="outlined"
          size="small"
          startIcon={loading ? undefined : <RefreshRoundedIcon />}
          onClick={fetchData}
          disabled={loading}
          sx={{ textTransform: "none", fontWeight: 600 }}
        >
          {loading ? "Chargement…" : "Actualiser"}
        </Button>
      </Box>

      {/* Summary stats */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 2 }}>
        {[
          { value: loading ? "—" : enriched.length,       label: "Contrats total",        color: theme.palette.info.main,    icon: <DescriptionOutlinedIcon /> },
          { value: loading ? "—" : inProgress.length,     label: "En cours",              color: theme.palette.warning.main, icon: <HourglassTopRoundedIcon /> },
          { value: loading ? "—" : signed.length,         label: "Signés & actifs",       color: theme.palette.success.main, icon: <CheckCircleRoundedIcon /> },
          { value: loading ? "—" : `${avgCommission}%`,   label: "Commission moyenne",    color: theme.palette.primary.main, icon: <DrawRoundedIcon /> },
        ].map(({ value, label, color, icon }) => (
          <Card key={label} elevation={0} variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}>
            <Box sx={{ height: 3, bgcolor: color }} />
            <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
              <Box sx={{
                width: 36, height: 36, borderRadius: 2,
                bgcolor: alpha(color, 0.12), color, display: "flex",
                alignItems: "center", justifyContent: "center", mb: 1,
              }}>
                {icon}
              </Box>
              <Typography sx={{ fontSize: "1.75rem", fontWeight: 800, lineHeight: 1, color }}>
                {value}
              </Typography>
              <Typography variant="bodySmall" color="text.secondary" sx={{ mt: 0.25 }}>{label}</Typography>
            </CardContent>
          </Card>
        ))}
      </Box>

      {/* Error */}
      {fetchError && (
        <Alert severity="error"
          action={<Button color="inherit" size="small" onClick={fetchData}>Réessayer</Button>}
          sx={{ borderRadius: 2 }}>
          {fetchError}
        </Alert>
      )}

      {/* Loading skeletons */}
      {loading && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rounded" height={160} sx={{ borderRadius: 3 }} />
          ))}
        </Box>
      )}

      {/* Signed section */}
      {!loading && signed.length > 0 && (
        <Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
            <CheckCircleRoundedIcon sx={{ color: "success.main", fontSize: 20 }} />
            <Typography variant="titleMedium" sx={{ fontWeight: 700 }}>Partenaires signés & actifs</Typography>
            <Chip label={signed.length} color="success" size="small" sx={{ fontWeight: 700 }} />
          </Box>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {signed.map(({ contract, prospect }) => (
              <ContractCard
                key={contract.id}
                contract={contract}
                prospect={prospect}
                onOpenFiche={handleOpenFiche}
                onOpenDialog={handleOpenDialog}
              />
            ))}
          </Box>
        </Box>
      )}

      {/* In-progress section */}
      {!loading && inProgress.length > 0 && (
        <Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
            <HourglassTopRoundedIcon sx={{ color: "warning.main", fontSize: 20 }} />
            <Typography variant="titleMedium" sx={{ fontWeight: 700 }}>Contrats en cours</Typography>
            <Chip label={inProgress.length} color="warning" size="small" sx={{ fontWeight: 700 }} />
          </Box>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {inProgress.map(({ contract, prospect }) => (
              <ContractCard
                key={contract.id}
                contract={contract}
                prospect={prospect}
                onOpenFiche={handleOpenFiche}
                onOpenDialog={handleOpenDialog}
              />
            ))}
          </Box>
        </Box>
      )}

      {/* Declined section */}
      {!loading && declined.length > 0 && (
        <Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
            <DoNotDisturbRoundedIcon sx={{ color: "error.main", fontSize: 20 }} />
            <Typography variant="titleMedium" sx={{ fontWeight: 700 }}>Contrats refusés</Typography>
            <Chip label={declined.length} color="error" size="small" sx={{ fontWeight: 700 }} />
          </Box>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {declined.map(({ contract, prospect }) => (
              <ContractCard
                key={contract.id}
                contract={contract}
                prospect={prospect}
                onOpenFiche={handleOpenFiche}
                onOpenDialog={handleOpenDialog}
              />
            ))}
          </Box>
        </Box>
      )}

      {/* Empty state */}
      {!loading && enriched.length === 0 && !fetchError && (
        <Card elevation={0} variant="outlined" sx={{ borderRadius: 3 }}>
          <CardContent sx={{ py: 6, textAlign: "center" }}>
            <InboxRoundedIcon sx={{ fontSize: 48, color: "text.disabled", mb: 1 }} />
            <Typography variant="titleSmall" color="text.secondary">Aucun contrat en cours</Typography>
            <Typography variant="bodySmall" color="text.disabled" sx={{ mt: 0.5 }}>
              Déplacez un prospect en étape Closing pour créer un contrat automatiquement.
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

      {/* Fiche drawer */}
      <ProspectDrawer
        prospect={selectedProspect}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onStageChange={handleStageChange}
        onNotesChange={handleNotesChange}
      />

      {/* Contract dialog */}
      {dialogContract && dialogProspect && (
        <ContractGenerateDialog
          open
          onClose={() => { setDialogContract(null); setDialogProspect(null); }}
          prospect={dialogProspect}
          contract={dialogContract}
          onContractUpdate={handleContractUpdate}
        />
      )}
    </Box>
  );
}
