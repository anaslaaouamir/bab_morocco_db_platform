"use client";

import React, { useState, useEffect } from "react";
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
import { alpha, useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import LinkedInIcon from "@mui/icons-material/LinkedIn";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import BedOutlinedIcon from "@mui/icons-material/BedOutlined";
import CalendarTodayOutlinedIcon from "@mui/icons-material/CalendarTodayOutlined";
import HotelOutlinedIcon from "@mui/icons-material/HotelOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import StarRateRoundedIcon from "@mui/icons-material/StarRateRounded";

import type { Prospect, PipelineStage } from "@/types/prospect";
import {
  scoreTotal,
  scoreColor,
  PARTNER_TYPE_LABELS,
  STAGE_LABELS,
  LANGUAGE_FLAGS,
} from "@/types/prospect";

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

// ─── Props ─────────────────────────────────────────────────────────────────

export interface ProspectDrawerProps {
  prospect: Prospect | null;
  open: boolean;
  onClose: () => void;
  onStageChange: (id: string, stage: PipelineStage) => void;
  onNotesChange: (id: string, notes: string) => void;
}

// ─── Main component ────────────────────────────────────────────────────────

export default function ProspectDrawer({
  prospect,
  open,
  onClose,
  onStageChange,
  onNotesChange,
}: ProspectDrawerProps) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));

  // Local notes state — synced when prospect changes
  const [notes, setNotes] = useState(prospect?.notes ?? "");
  useEffect(() => {
    setNotes(prospect?.notes ?? "");
  }, [prospect?.id, prospect?.notes]);

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

        {/* Close button + escalation alert */}
        <Box sx={{ display: "flex", alignItems: "flex-start", mb: 1.5 }}>
          <Box sx={{ flex: 1 }}>
            {needsHumanValidation && (
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
              {prospect.nom}
            </Typography>
          </Box>
          <IconButton onClick={onClose} size="small" aria-label="Fermer" sx={{ mt: -0.5 }}>
            <CloseRoundedIcon fontSize="small" />
          </IconButton>
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

        {/* Bottom spacer for mobile safe area */}
        <Box sx={{ pb: { xs: "env(safe-area-inset-bottom, 0px)", md: 0 } }} />
      </Box>
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
