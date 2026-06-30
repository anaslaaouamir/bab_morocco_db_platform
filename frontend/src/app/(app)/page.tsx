"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardActionArea from "@mui/material/CardActionArea";
import Chip from "@mui/material/Chip";
import LinearProgress from "@mui/material/LinearProgress";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Avatar from "@mui/material/Avatar";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Skeleton from "@mui/material/Skeleton";
import Tooltip from "@mui/material/Tooltip";
import { alpha, useTheme } from "@mui/material/styles";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import VerifiedRoundedIcon from "@mui/icons-material/VerifiedRounded";
import ForumRoundedIcon from "@mui/icons-material/ForumRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";
import FlagRoundedIcon from "@mui/icons-material/FlagRounded";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import StarRateRoundedIcon from "@mui/icons-material/StarRateRounded";
import MarkEmailReadOutlinedIcon from "@mui/icons-material/MarkEmailReadOutlined";
import CalendarTodayOutlinedIcon from "@mui/icons-material/CalendarTodayOutlined";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import NorthEastRoundedIcon from "@mui/icons-material/NorthEastRounded";

import type { Prospect, PipelineStage } from "@/types/prospect";
import {
  scoreTotal,
  scoreColor,
  PARTNER_TYPE_LABELS,
  STAGE_LABELS,
  LANGUAGE_FLAGS,
} from "@/types/prospect";
import { prospectsApi, ApiError } from "@/lib/api";

// ─── Static config ────────────────────────────────────────────────────────────

const GOALS = { prospects: 500, conversations: 50, signed: 30 } as const;

const FUNNEL_STAGES: PipelineStage[] = [
  "prospection", "qualification", "outreach", "negociation", "closing", "activation_ota",
];

const FUNNEL_COLORS: Record<string, string> = {
  prospection:    "#78909C",
  qualification:  "#42A5F5",
  outreach:       "#FFA726",
  negociation:    "#AB47BC",
  closing:        "#66BB6A",
  activation_ota: "#2E7D32",
};

// ─── Helper components ────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      variant="titleMedium"
      sx={{ fontWeight: 700, mb: 1.5, display: "flex", alignItems: "center", gap: 1 }}
    >
      {children}
    </Typography>
  );
}

// ─── KPI Mega Card ────────────────────────────────────────────────────────────

interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  goal?: number;
  subLabel?: string;
  color: string;
  href: string;
  loading?: boolean;
}

function KpiCard({ icon, label, value, goal, subLabel, color, href, loading }: KpiCardProps) {
  const pct = goal ? Math.min(100, Math.round((value / goal) * 100)) : null;

  if (loading) {
    return (
      <Card elevation={0} variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}>
        <Box sx={{ height: 4, bgcolor: "action.hover", borderRadius: "3px 3px 0 0" }} />
        <CardContent sx={{ p: 2.5, pb: "20px !important" }}>
          <Skeleton variant="rounded" width={40} height={40} sx={{ borderRadius: 2, mb: 1.5 }} />
          <Skeleton variant="text" width={60} sx={{ fontSize: "2.25rem" }} />
          <Skeleton variant="text" width={100} />
          {goal && <Skeleton variant="rounded" height={5} sx={{ mt: 1.5, borderRadius: 3 }} />}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card elevation={0} variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}>
      <CardActionArea component={Link} href={href} sx={{ height: "100%" }}>
        <Box sx={{ height: 4, bgcolor: color, borderRadius: "3px 3px 0 0" }} />
        <CardContent sx={{ p: 2.5, pb: "20px !important" }}>
          <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", mb: 1.5 }}>
            <Box
              sx={{
                width: 40, height: 40, borderRadius: 2,
                bgcolor: alpha(color, 0.12),
                display: "flex", alignItems: "center", justifyContent: "center", color,
              }}
            >
              {icon}
            </Box>
            {pct !== null && (
              <Typography variant="labelSmall" sx={{ color, fontWeight: 700, fontSize: "0.75rem" }}>
                {pct}%
              </Typography>
            )}
          </Box>

          <Typography sx={{ fontSize: "2.25rem", fontWeight: 800, lineHeight: 1, color }}>
            {value}
          </Typography>
          <Typography variant="bodyMedium" sx={{ fontWeight: 600, mt: 0.25 }}>{label}</Typography>
          {subLabel && (
            <Typography variant="bodySmall" color="text.secondary" sx={{ mt: 0.25 }}>
              {subLabel}
            </Typography>
          )}

          {goal && (
            <Box sx={{ mt: 1.5 }}>
              <LinearProgress
                variant="determinate"
                value={pct ?? 0}
                sx={{
                  height: 5, borderRadius: 3,
                  bgcolor: alpha(color, 0.15),
                  "& .MuiLinearProgress-bar": { bgcolor: color, borderRadius: 3 },
                }}
              />
              <Typography variant="labelSmall" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                Objectif : {goal.toLocaleString("fr-FR")}
              </Typography>
            </Box>
          )}
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

// ─── Section skeleton ─────────────────────────────────────────────────────────

function CardSkeleton({ height = 180 }: { height?: number }) {
  return (
    <Card elevation={0} variant="outlined" sx={{ borderRadius: 3 }}>
      <CardContent sx={{ p: 2.5 }}>
        <Skeleton variant="text" width={160} sx={{ mb: 1.5, fontSize: "1rem" }} />
        <Skeleton variant="rounded" height={height - 60} sx={{ borderRadius: 2 }} />
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const theme = useTheme();

  const TODAY = useMemo(() => new Date().toISOString().split("T")[0], []);

  // ── Remote state ──────────────────────────────────────────────────────────
  const [prospects, setProspects]   = useState<Prospect[]>([]);
  const [loading, setLoading]       = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  async function fetchProspects() {
    setLoading(true);
    setFetchError(null);
    try {
      const result = await prospectsApi.list({ pageSize: 100 });
      setProspects(result.items);
    } catch (err) {
      setFetchError(
        err instanceof ApiError
          ? err.detail
          : "Impossible de charger les données. Vérifiez que le backend est démarré.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchProspects(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived data ──────────────────────────────────────────────────────────

  const kpiTotal         = prospects.length;
  const kpiQualified     = useMemo(() => prospects.filter((p) => scoreTotal(p.score) >= 75).length, [prospects]);
  const kpiConversations = useMemo(() => prospects.filter((p) => ["outreach", "negociation", "closing"].includes(p.stage)).length, [prospects]);
  const kpiSigned        = useMemo(() => prospects.filter((p) => p.stage === "activation_ota").length, [prospects]);

  const scorePremium = useMemo(() => prospects.filter((p) => scoreTotal(p.score) >= 85).length, [prospects]);
  const scoreQual    = useMemo(() => prospects.filter((p) => { const t = scoreTotal(p.score); return t >= 75 && t < 85; }).length, [prospects]);
  const scoreBelow   = useMemo(() => prospects.filter((p) => scoreTotal(p.score) < 75).length, [prospects]);

  const stageCounts = useMemo(
    () =>
      Object.fromEntries(
        (["prospection","qualification","outreach","negociation","closing","activation_ota","veille","perdu"] as PipelineStage[])
          .map((s) => [s, prospects.filter((p) => p.stage === s).length]),
      ) as Record<PipelineStage, number>,
    [prospects],
  );

  const top5 = useMemo(
    () => [...prospects].sort((a, b) => scoreTotal(b.score) - scoreTotal(a.score)).slice(0, 5),
    [prospects],
  );

  const humanRequired = useMemo(
    () => prospects.filter((p) => p.notes?.includes("VALIDATION HUMAINE REQUISE")),
    [prospects],
  );
  const dueToday = useMemo(
    () => prospects.filter((p) => p.dateProchainContact === TODAY),
    [prospects, TODAY],
  );
  const overdue = useMemo(
    () => prospects.filter(
      (p) => p.dateProchainContact && p.dateProchainContact < TODAY
          && p.stage !== "veille" && p.stage !== "perdu",
    ),
    [prospects, TODAY],
  );

  const marketData = useMemo(() => [
    { label: "Maroc",  color: "#1B6CA8", count: prospects.filter((p) => p.pays === "Maroc").length },
    { label: "France", color: "#B5451B", count: prospects.filter((p) => p.pays === "France").length },
    { label: "EAU",    color: "#2E7D32", count: prospects.filter((p) => p.pays === "Émirats Arabes Unis").length },
    {
      label: "Golfe", color: "#AB47BC",
      count: prospects.filter(
        (p) => ["Arabie Saoudite", "Qatar", "Koweït", "Bahreïn"].includes(p.pays)
            || (p.type === "to_golfe" && p.pays !== "Émirats Arabes Unis"),
      ).length,
    },
  ], [prospects]);

  const marketOther = useMemo(
    () => kpiTotal - marketData.reduce((s, m) => s + m.count, 0),
    [kpiTotal, marketData],
  );

  const outreachProspects = useMemo(
    () => prospects.filter((p) => p.stage === "outreach"),
    [prospects],
  );

  const recentProspects = useMemo(
    () => [...prospects].sort((a, b) => b.dateAjout.localeCompare(a.dateAjout)).slice(0, 5),
    [prospects],
  );

  const closingPartners   = useMemo(() => prospects.filter((p) => p.stage === "closing"), [prospects]);
  const activatedPartners = useMemo(() => prospects.filter((p) => p.stage === "activation_ota"), [prospects]);
  const avgCommClosing    = useMemo(
    () => closingPartners.length
      ? Math.round(closingPartners.reduce((s, p) => s + p.commissionStandard, 0) / closingPartners.length)
      : 0,
    [closingPartners],
  );

  const typeBreakdown = useMemo(
    () =>
      (
        Object.entries(
          prospects.reduce<Record<string, number>>((acc, p) => {
            acc[p.type] = (acc[p.type] ?? 0) + 1;
            return acc;
          }, {}),
        ) as [import("@/types/prospect").PartnerType, number][]
      ).sort(([, a], [, b]) => b - a),
    [prospects],
  );

  // P5-01 — Perdu conversion rate (pool = all prospects that reached négociation or beyond)
  const perduCount = stageCounts["perdu"] ?? 0;
  const perduPool  = useMemo(
    () => (stageCounts["negociation"] ?? 0) + (stageCounts["closing"] ?? 0) + kpiSigned + perduCount,
    [stageCounts, kpiSigned, perduCount],
  );
  const perduPct = perduPool > 0 ? Math.round((perduCount / perduPool) * 100) : 0;

  // P5-02 — Actions en attente (derivable from allProspects)
  const pendingOutreach    = outreachProspects.length;                     // needs email work
  const pendingNegociation = stageCounts["negociation"] ?? 0;              // awaiting reply / analysis
  const pendingContracts   = stageCounts["closing"] ?? 0;                  // contract to generate / send
  const pendingActionsTotal = pendingOutreach + pendingNegociation + pendingContracts;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Box sx={{ px: { xs: 2, sm: 3, md: 4 }, py: { xs: 2, md: 3 }, display: "flex", flexDirection: "column", gap: 3 }}>

      {/* ── Header ──────────────────────────────────────────────── */}
      <Box>
        <Typography variant="headlineMedium" component="h1" sx={{ mb: 0.5 }}>
          Dashboard
        </Typography>
        <Typography variant="bodyMedium" color="text.secondary">
          {loading
            ? "Chargement des données…"
            : fetchError
            ? "Erreur de chargement"
            : `Vue d'ensemble du pipeline B2B — données en temps réel depuis ${kpiTotal} partenaires trackés`}
        </Typography>
      </Box>

      {/* ── Error banner ─────────────────────────────────────────── */}
      {fetchError && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={fetchProspects}>
              Réessayer
            </Button>
          }
        >
          {fetchError}
        </Alert>
      )}

      {/* ── 2.1 — KPI Mega Cards ─────────────────────────────────── */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 2 }}>
        <KpiCard
          loading={loading}
          icon={<GroupsRoundedIcon />}
          label="Prospects"
          value={kpiTotal}
          goal={GOALS.prospects}
          subLabel={`${kpiTotal} / ${GOALS.prospects} objectif lancement`}
          color={theme.palette.info.main}
          href="/prospection"
        />
        <KpiCard
          loading={loading}
          icon={<VerifiedRoundedIcon />}
          label="Qualifiés ≥75"
          value={kpiQualified}
          subLabel={`${scoreBelow} sous le seuil outreach`}
          color={theme.palette.primary.main}
          href="/prospection"
        />
        <KpiCard
          loading={loading}
          icon={<ForumRoundedIcon />}
          label="Conversations actives"
          value={kpiConversations}
          goal={GOALS.conversations}
          subLabel="Outreach + Négociation + Closing"
          color={theme.palette.warning.main}
          href="/prospection"
        />
        <KpiCard
          loading={loading}
          icon={<CheckCircleRoundedIcon />}
          label="Partenariats signés"
          value={kpiSigned}
          goal={GOALS.signed}
          subLabel="Actifs sur babmorocco.com"
          color={theme.palette.success.main}
          href="/contrats"
        />
      </Box>

      {/* ── 2.3 Goals + 2.10 Priority Alerts ──────────────────────── */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>

        {/* Goals Progress */}
        {loading ? <CardSkeleton height={240} /> : (
          <Card elevation={0} variant="outlined" sx={{ borderRadius: 3 }}>
            <CardContent sx={{ p: 2.5 }}>
              <SectionTitle>
                <FlagRoundedIcon sx={{ color: "primary.main", fontSize: 20 }} />
                Objectifs Phase 1
              </SectionTitle>

              {[
                { label: "Prospects qualifiés",   current: kpiTotal,         goal: GOALS.prospects,     color: theme.palette.info.main,    detail: `${kpiQualified} ≥75 pts` },
                { label: "Conversations actives",  current: kpiConversations, goal: GOALS.conversations, color: theme.palette.warning.main,  detail: "Outreach → Closing" },
                { label: "Partenariats signés",    current: kpiSigned,        goal: GOALS.signed,        color: theme.palette.success.main,  detail: `${closingPartners.length} en cours de closing` },
              ].map(({ label, current, goal, color, detail }) => {
                const pct = Math.min(100, Math.round((current / goal) * 100));
                return (
                  <Box key={label} sx={{ mb: 2 }}>
                    <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.75 }}>
                      <Box>
                        <Typography variant="bodySmall" sx={{ fontWeight: 600 }}>{label}</Typography>
                        <Typography variant="bodySmall" color="text.secondary">{detail}</Typography>
                      </Box>
                      <Box sx={{ textAlign: "right", flexShrink: 0 }}>
                        <Typography sx={{ fontWeight: 800, fontSize: "1.125rem", lineHeight: 1, color }}>{current}</Typography>
                        <Typography variant="labelSmall" color="text.secondary">/{goal}</Typography>
                      </Box>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={pct}
                      sx={{
                        height: 8, borderRadius: 4,
                        bgcolor: alpha(color, 0.12),
                        "& .MuiLinearProgress-bar": { bgcolor: color, borderRadius: 4 },
                      }}
                    />
                    <Typography variant="labelSmall" color="text.secondary" sx={{ mt: 0.5 }}>
                      {pct}% de l&apos;objectif lancement
                    </Typography>
                  </Box>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Priority Alerts */}
        {loading ? <CardSkeleton height={240} /> : (
          <Card elevation={0} variant="outlined" sx={{ borderRadius: 3 }}>
            <CardContent sx={{ p: 2.5 }}>
              <SectionTitle>
                <WarningAmberRoundedIcon sx={{ color: "error.main", fontSize: 20 }} />
                Alertes prioritaires
              </SectionTitle>

              <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
                {humanRequired.map((p) => (
                  <Alert
                    key={p.id}
                    severity="error"
                    icon={<WarningAmberRoundedIcon fontSize="small" />}
                    action={
                      <Chip
                        label="Voir"
                        size="small"
                        component={Link}
                        href="/prospection"
                        clickable
                        sx={{ fontSize: "0.625rem" }}
                      />
                    }
                    sx={{ py: 0.5, borderRadius: 2, fontSize: "0.8125rem", alignItems: "center" }}
                  >
                    <AlertTitle sx={{ fontSize: "0.8125rem", fontWeight: 700, mb: 0 }}>{p.nom}</AlertTitle>
                    Validation humaine requise · {STAGE_LABELS[p.stage]}
                  </Alert>
                ))}

                {dueToday.map((p) => (
                  <Alert
                    key={p.id}
                    severity="warning"
                    icon={<CalendarTodayOutlinedIcon fontSize="small" />}
                    sx={{ py: 0.5, borderRadius: 2, fontSize: "0.8125rem", alignItems: "center" }}
                  >
                    <AlertTitle sx={{ fontSize: "0.8125rem", fontWeight: 700, mb: 0 }}>{p.nom}</AlertTitle>
                    Contact prévu aujourd&apos;hui · {STAGE_LABELS[p.stage]}
                  </Alert>
                ))}

                {overdue.map((p) => (
                  <Alert
                    key={p.id}
                    severity="warning"
                    icon={<CalendarTodayOutlinedIcon fontSize="small" />}
                    sx={{ py: 0.5, borderRadius: 2, fontSize: "0.8125rem", alignItems: "center" }}
                  >
                    <AlertTitle sx={{ fontSize: "0.8125rem", fontWeight: 700, mb: 0 }}>{p.nom}</AlertTitle>
                    Contact en retard depuis {p.dateProchainContact} · {STAGE_LABELS[p.stage]}
                  </Alert>
                ))}

                {humanRequired.length === 0 && dueToday.length === 0 && overdue.length === 0 && (
                  <Box sx={{ py: 3, display: "flex", flexDirection: "column", alignItems: "center", gap: 1, color: "text.disabled" }}>
                    <CheckCircleRoundedIcon sx={{ fontSize: 32 }} />
                    <Typography variant="bodySmall">Aucune alerte active</Typography>
                  </Box>
                )}
              </Box>
            </CardContent>
          </Card>
        )}
      </Box>

      {/* ── P5-02 — Actions en attente ───────────────────────────── */}
      {!loading && pendingActionsTotal > 0 && (
        <Card elevation={0} variant="outlined" sx={{ borderRadius: 3 }}>
          <CardContent sx={{ p: 2.5 }}>
            <SectionTitle>
              <FlagRoundedIcon sx={{ color: "warning.main", fontSize: 20 }} />
              Actions en attente
              <Chip
                label={pendingActionsTotal}
                color="warning"
                size="small"
                sx={{ fontWeight: 800, ml: 0.5, height: 20, fontSize: "0.6875rem", "& .MuiChip-label": { px: 0.75 } }}
              />
            </SectionTitle>

            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {pendingOutreach > 0 && (
                <Box
                  component={Link}
                  href="/outreach"
                  sx={{
                    display: "flex", alignItems: "center", gap: 1.5,
                    p: 1.25, borderRadius: 2, textDecoration: "none",
                    border: `1px solid ${alpha("#FFA726", 0.3)}`,
                    bgcolor: alpha("#FFA726", 0.05),
                    "&:hover": { bgcolor: alpha("#FFA726", 0.1) },
                    transition: "background-color 150ms ease",
                  }}
                >
                  <MarkEmailReadOutlinedIcon sx={{ color: "warning.main", fontSize: 20, flexShrink: 0 }} />
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="bodySmall" sx={{ fontWeight: 700, color: "text.primary" }}>
                      {pendingOutreach} séquence{pendingOutreach > 1 ? "s" : ""} outreach active{pendingOutreach > 1 ? "s" : ""}
                    </Typography>
                    <Typography variant="bodySmall" color="text.secondary" sx={{ fontSize: "0.6875rem" }}>
                      Emails à valider et à envoyer
                    </Typography>
                  </Box>
                  <ArrowForwardRoundedIcon sx={{ fontSize: 16, color: "text.disabled" }} />
                </Box>
              )}

              {pendingNegociation > 0 && (
                <Box
                  component={Link}
                  href="/negociation"
                  sx={{
                    display: "flex", alignItems: "center", gap: 1.5,
                    p: 1.25, borderRadius: 2, textDecoration: "none",
                    border: `1px solid ${alpha("#AB47BC", 0.3)}`,
                    bgcolor: alpha("#AB47BC", 0.05),
                    "&:hover": { bgcolor: alpha("#AB47BC", 0.1) },
                    transition: "background-color 150ms ease",
                  }}
                >
                  <ForumRoundedIcon sx={{ color: "secondary.main", fontSize: 20, flexShrink: 0 }} />
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="bodySmall" sx={{ fontWeight: 700, color: "text.primary" }}>
                      {pendingNegociation} négociation{pendingNegociation > 1 ? "s" : ""} en cours
                    </Typography>
                    <Typography variant="bodySmall" color="text.secondary" sx={{ fontSize: "0.6875rem" }}>
                      Messages à analyser ou réponses à envoyer
                    </Typography>
                  </Box>
                  <ArrowForwardRoundedIcon sx={{ fontSize: 16, color: "text.disabled" }} />
                </Box>
              )}

              {pendingContracts > 0 && (
                <Box
                  component={Link}
                  href="/contrats"
                  sx={{
                    display: "flex", alignItems: "center", gap: 1.5,
                    p: 1.25, borderRadius: 2, textDecoration: "none",
                    border: `1px solid ${alpha("#66BB6A", 0.3)}`,
                    bgcolor: alpha("#66BB6A", 0.05),
                    "&:hover": { bgcolor: alpha("#66BB6A", 0.1) },
                    transition: "background-color 150ms ease",
                  }}
                >
                  <NorthEastRoundedIcon sx={{ color: "success.main", fontSize: 20, flexShrink: 0 }} />
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="bodySmall" sx={{ fontWeight: 700, color: "text.primary" }}>
                      {pendingContracts} contrat{pendingContracts > 1 ? "s" : ""} à traiter
                    </Typography>
                    <Typography variant="bodySmall" color="text.secondary" sx={{ fontSize: "0.6875rem" }}>
                      Générer le PDF et envoyer au partenaire
                    </Typography>
                  </Box>
                  <ArrowForwardRoundedIcon sx={{ fontSize: 16, color: "text.disabled" }} />
                </Box>
              )}
            </Box>
          </CardContent>
        </Card>
      )}

      {/* ── 2.2 — Pipeline Funnel ─────────────────────────────────── */}
      {loading ? <CardSkeleton height={140} /> : (
        <Card elevation={0} variant="outlined" sx={{ borderRadius: 3 }}>
          <CardContent sx={{ p: 2.5 }}>
            <SectionTitle>
              <TrendingUpRoundedIcon sx={{ color: "primary.main", fontSize: 20 }} />
              Entonnoir pipeline
            </SectionTitle>

            <Box
              sx={{
                display: "flex", alignItems: "stretch", gap: 0, overflowX: "auto",
                "&::-webkit-scrollbar": { height: 4 },
                "&::-webkit-scrollbar-thumb": { bgcolor: "divider", borderRadius: 2 },
              }}
            >
              {FUNNEL_STAGES.map((stage, i) => {
                const count = stageCounts[stage] ?? 0;
                const prevCount = i > 0 ? (stageCounts[FUNNEL_STAGES[i - 1]] ?? 0) : kpiTotal;
                const convPct = prevCount > 0 ? Math.round((count / prevCount) * 100) : 0;
                const color = FUNNEL_COLORS[stage];

                return (
                  <React.Fragment key={stage}>
                    <Box
                      sx={{
                        flex: 1, minWidth: 100, display: "flex", flexDirection: "column",
                        alignItems: "center", py: 1.5, px: 1, borderRadius: 2,
                        bgcolor: alpha(color, 0.06),
                        border: `1px solid ${alpha(color, 0.2)}`,
                      }}
                    >
                      <Box sx={{ width: "100%", height: 3, bgcolor: color, borderRadius: 2, mb: 1.25 }} />
                      <Typography sx={{ fontSize: "1.875rem", fontWeight: 800, lineHeight: 1, color }}>
                        {count}
                      </Typography>
                      <Typography variant="labelSmall" sx={{ fontWeight: 600, color: "text.primary", mt: 0.5, textAlign: "center" }}>
                        {STAGE_LABELS[stage]}
                      </Typography>
                      {i > 0 && (
                        <Tooltip title={`${convPct}% du stade précédent`}>
                          <Typography
                            variant="labelSmall"
                            sx={{
                              mt: 0.5, fontSize: "0.5625rem", fontWeight: 700,
                              color: convPct >= 80 ? "success.main" : convPct >= 50 ? "warning.main" : "error.main",
                            }}
                          >
                            {convPct}% conv.
                          </Typography>
                        </Tooltip>
                      )}
                    </Box>
                    {i < FUNNEL_STAGES.length - 1 && (
                      <Box sx={{ display: "flex", alignItems: "center", px: 0.25, color: "text.disabled", flexShrink: 0 }}>
                        <ArrowForwardRoundedIcon sx={{ fontSize: 16 }} />
                      </Box>
                    )}
                  </React.Fragment>
                );
              })}

              {/* Fallout column */}
              <Box sx={{ display: "flex", alignItems: "center", px: 1, color: "text.disabled", flexShrink: 0 }}>
                <Typography variant="labelSmall" sx={{ mx: 0.5 }}>|</Typography>
              </Box>
              {(["veille", "perdu"] as PipelineStage[]).map((stage) => (
                <Box
                  key={stage}
                  sx={{
                    minWidth: 80, display: "flex", flexDirection: "column", alignItems: "center",
                    py: 1.5, px: 1, borderRadius: 2,
                    bgcolor: alpha(theme.palette.action.disabled, 0.06),
                    border: `1px dashed ${theme.palette.divider}`,
                    ml: 0.5,
                  }}
                >
                  <Typography sx={{ fontSize: "1.875rem", fontWeight: 800, lineHeight: 1, color: "text.secondary" }}>
                    {stageCounts[stage] ?? 0}
                  </Typography>
                  <Typography variant="labelSmall" color="text.secondary" sx={{ mt: 0.5, textAlign: "center" }}>
                    {STAGE_LABELS[stage]}
                  </Typography>
                </Box>
              ))}
            </Box>

            {/* P5-01 — Perdu counter + conversion rate */}
            {perduCount > 0 && (
              <Box sx={{ mt: 1.5, display: "flex", alignItems: "center", gap: 1.25, flexWrap: "wrap" }}>
                <Chip
                  label={`${perduCount} perdu${perduCount > 1 ? "s" : ""}`}
                  size="small"
                  variant="outlined"
                  sx={{ fontWeight: 700, fontSize: "0.6875rem", borderStyle: "dashed" }}
                />
                <Typography variant="labelSmall" color="text.disabled" sx={{ fontSize: "0.6875rem" }}>
                  {perduPct}% des prospects ayant atteint la négociation ont été perdus
                </Typography>
              </Box>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── 2.4 Score Distribution + 2.5 Top Prospects ──────────── */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 2fr" }, gap: 2 }}>

        {/* Score Distribution */}
        {loading ? <CardSkeleton height={260} /> : (
          <Card elevation={0} variant="outlined" sx={{ borderRadius: 3 }}>
            <CardContent sx={{ p: 2.5 }}>
              <SectionTitle>
                <StarRateRoundedIcon sx={{ color: "warning.main", fontSize: 20 }} />
                Distribution des scores
              </SectionTitle>

              {[
                { label: "Premium ≥85",  count: scorePremium, color: theme.palette.success.main, description: "Priorité outreach maximale" },
                { label: "Qualifié 75–84", count: scoreQual,  color: theme.palette.warning.main, description: "Éligible outreach standard" },
                { label: "Sous seuil <75", count: scoreBelow, color: theme.palette.error.main,   description: "Mis en veille automatique" },
              ].map(({ label, count, color, description }) => {
                const pct = kpiTotal > 0 ? Math.round((count / kpiTotal) * 100) : 0;
                return (
                  <Box key={label} sx={{ mb: 2 }}>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.75 }}>
                      <Box>
                        <Typography variant="bodySmall" sx={{ fontWeight: 600 }}>{label}</Typography>
                        <Typography variant="bodySmall" color="text.secondary" sx={{ display: "block", fontSize: "0.6875rem" }}>
                          {description}
                        </Typography>
                      </Box>
                      <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.5, flexShrink: 0, ml: 1 }}>
                        <Typography sx={{ fontWeight: 800, fontSize: "1.25rem", lineHeight: 1, color }}>{count}</Typography>
                        <Typography variant="labelSmall" color="text.secondary">({pct}%)</Typography>
                      </Box>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={pct}
                      sx={{
                        height: 8, borderRadius: 4,
                        bgcolor: alpha(color, 0.12),
                        "& .MuiLinearProgress-bar": { bgcolor: color, borderRadius: 4 },
                      }}
                    />
                  </Box>
                );
              })}

              <Divider sx={{ my: 1.5 }} />

              <Typography variant="labelSmall" color="text.secondary" sx={{ mb: 1, display: "block" }}>
                Par type de partenaire
              </Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                {typeBreakdown.map(([type, count]) => (
                  <Chip
                    key={type}
                    label={`${PARTNER_TYPE_LABELS[type]} ${count}`}
                    size="small"
                    variant="outlined"
                    sx={{ fontSize: "0.625rem", height: 20, "& .MuiChip-label": { px: 0.75 } }}
                  />
                ))}
              </Box>
            </CardContent>
          </Card>
        )}

        {/* Top 5 Prospects */}
        {loading ? <CardSkeleton height={260} /> : (
          <Card elevation={0} variant="outlined" sx={{ borderRadius: 3 }}>
            <CardContent sx={{ p: 2.5 }}>
              <SectionTitle>
                <NorthEastRoundedIcon sx={{ color: "primary.main", fontSize: 20 }} />
                Top 5 prospects par score
              </SectionTitle>

              <Box sx={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {top5.map((p, i) => {
                  const total = scoreTotal(p.score);
                  const color = scoreColor(total);
                  const muiColor = theme.palette[color].main;

                  return (
                    <React.Fragment key={p.id}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 1.25 }}>
                        <Avatar
                          sx={{
                            width: 28, height: 28, flexShrink: 0,
                            bgcolor: i === 0 ? "warning.main" : "action.selected",
                            fontSize: "0.75rem", fontWeight: 800,
                          }}
                        >
                          {i + 1}
                        </Avatar>

                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography
                            variant="bodySmall"
                            sx={{ fontWeight: 700, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                          >
                            {p.nom}
                          </Typography>
                          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mt: 0.25 }}>
                            <Chip
                              label={PARTNER_TYPE_LABELS[p.type]}
                              size="small"
                              sx={{ height: 16, fontSize: "0.5625rem", "& .MuiChip-label": { px: 0.5 } }}
                            />
                            <PlaceOutlinedIcon sx={{ fontSize: 11, color: "text.secondary" }} />
                            <Typography variant="bodySmall" color="text.secondary" sx={{ fontSize: "0.6875rem" }}>
                              {p.ville}
                            </Typography>
                            <Typography component="span" sx={{ fontSize: "0.75rem" }}>
                              {LANGUAGE_FLAGS[p.langue]}
                            </Typography>
                          </Box>
                        </Box>

                        <Box sx={{ textAlign: "right", flexShrink: 0, minWidth: 80 }}>
                          <Typography sx={{ fontWeight: 800, fontSize: "1.125rem", lineHeight: 1, color: muiColor }}>
                            {total}
                          </Typography>
                          <LinearProgress
                            variant="determinate"
                            value={total}
                            sx={{
                              height: 4, borderRadius: 2, mt: 0.5,
                              bgcolor: alpha(muiColor, 0.15),
                              "& .MuiLinearProgress-bar": { bgcolor: muiColor, borderRadius: 2 },
                            }}
                          />
                          <Chip
                            label={STAGE_LABELS[p.stage]}
                            size="small"
                            sx={{ mt: 0.5, height: 16, fontSize: "0.5625rem", fontWeight: 600, "& .MuiChip-label": { px: 0.5 } }}
                          />
                        </Box>
                      </Box>
                      {i < top5.length - 1 && <Divider />}
                    </React.Fragment>
                  );
                })}

                {top5.length === 0 && (
                  <Typography variant="bodySmall" color="text.disabled" sx={{ py: 2, textAlign: "center" }}>
                    Aucun prospect dans la base.
                  </Typography>
                )}
              </Box>

              <Box sx={{ mt: 2, display: "flex", justifyContent: "flex-end" }}>
                <Chip
                  label="Voir tous les prospects →"
                  component={Link}
                  href="/prospection"
                  clickable
                  color="primary"
                  variant="outlined"
                  size="small"
                />
              </Box>
            </CardContent>
          </Card>
        )}
      </Box>

      {/* ── 2.8 Market + 2.9 Outreach Sequences + 2.7 Commission ── */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 2 }}>

        {/* Market Breakdown */}
        {loading ? <CardSkeleton height={200} /> : (
          <Card elevation={0} variant="outlined" sx={{ borderRadius: 3 }}>
            <CardContent sx={{ p: 2.5 }}>
              <SectionTitle>
                <PlaceOutlinedIcon sx={{ color: "info.main", fontSize: 20 }} />
                Marchés cibles
              </SectionTitle>

              <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
                {marketData.map(({ label, color, count }) => {
                  const pct = kpiTotal > 0 ? Math.round((count / kpiTotal) * 100) : 0;
                  return (
                    <Box key={label}>
                      <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                        <Typography variant="bodySmall" sx={{ fontWeight: 600 }}>{label}</Typography>
                        <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.5 }}>
                          <Typography sx={{ fontWeight: 700, fontSize: "1rem", lineHeight: 1, color }}>{count}</Typography>
                          <Typography variant="labelSmall" color="text.secondary">({pct}%)</Typography>
                        </Box>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={pct}
                        sx={{
                          height: 6, borderRadius: 3,
                          bgcolor: alpha(color, 0.12),
                          "& .MuiLinearProgress-bar": { bgcolor: color, borderRadius: 3 },
                        }}
                      />
                    </Box>
                  );
                })}

                {marketOther > 0 && (
                  <Box>
                    <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                      <Typography variant="bodySmall" sx={{ fontWeight: 600 }}>Autres</Typography>
                      <Typography sx={{ fontWeight: 700, fontSize: "1rem", lineHeight: 1, color: "text.secondary" }}>
                        {marketOther}
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={kpiTotal > 0 ? Math.round((marketOther / kpiTotal) * 100) : 0}
                      sx={{ height: 6, borderRadius: 3, bgcolor: "action.hover" }}
                    />
                  </Box>
                )}
              </Box>
            </CardContent>
          </Card>
        )}

        {/* Outreach Sequences */}
        {loading ? <CardSkeleton height={200} /> : (
          <Card elevation={0} variant="outlined" sx={{ borderRadius: 3 }}>
            <CardContent sx={{ p: 2.5 }}>
              <SectionTitle>
                <MarkEmailReadOutlinedIcon sx={{ color: "warning.main", fontSize: 20 }} />
                Séquences outreach actives
              </SectionTitle>

              {/* P2-03 — Outreach KPI chips */}
              <Box sx={{ display: "flex", gap: 0.75, mb: 1.5, flexWrap: "wrap" }}>
                <Chip
                  label={
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                      <Typography component="span" sx={{ fontWeight: 800, fontSize: "0.8125rem", lineHeight: 1 }}>
                        {outreachProspects.length}
                      </Typography>
                      <Typography component="span" sx={{ fontSize: "0.6875rem", opacity: 0.85 }}>
                        en outreach
                      </Typography>
                    </Box>
                  }
                  color="warning"
                  variant="outlined"
                  size="small"
                  sx={{ height: 26, "& .MuiChip-label": { px: 1 } }}
                />
                <Chip
                  label={
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                      <Typography component="span" sx={{ fontWeight: 800, fontSize: "0.8125rem", lineHeight: 1 }}>
                        {outreachProspects.filter((p) => !!p.dateProchainContact).length}
                      </Typography>
                      <Typography component="span" sx={{ fontSize: "0.6875rem", opacity: 0.85 }}>
                        email envoyé
                      </Typography>
                    </Box>
                  }
                  color="success"
                  variant="outlined"
                  size="small"
                  sx={{ height: 26, "& .MuiChip-label": { px: 1 } }}
                />
              </Box>

              {outreachProspects.length === 0 ? (
                <Typography variant="bodySmall" color="text.secondary">
                  Aucune séquence active.
                </Typography>
              ) : (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {outreachProspects.map((p, i) => {
                    const next = p.dateProchainContact ?? "";
                    const isOverdue  = !!next && next < TODAY;
                    const isDueToday = next === TODAY;
                    const statusColor = isOverdue ? "error" : isDueToday ? "warning" : "default";
                    const statusLabel = isOverdue
                      ? "En retard"
                      : isDueToday
                      ? "À contacter aujourd'hui"
                      : `Relance ${next}`;
                    const step = p.notes?.includes("J0") ? "J0 envoyé" : "En attente";

                    return (
                      <React.Fragment key={p.id}>
                        <Box sx={{ py: 1.25 }}>
                          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 0.5 }}>
                            <Typography
                              variant="bodySmall"
                              sx={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, mr: 1 }}
                            >
                              {p.nom}
                            </Typography>
                            <Chip
                              label={statusLabel}
                              color={statusColor}
                              size="small"
                              sx={{ height: 18, fontSize: "0.5625rem", fontWeight: 700, "& .MuiChip-label": { px: 0.5 }, flexShrink: 0 }}
                            />
                          </Box>
                          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                            <Typography variant="bodySmall" color="text.secondary" sx={{ fontSize: "0.6875rem" }}>
                              {step}
                            </Typography>
                            <Typography variant="bodySmall" color="text.disabled" sx={{ fontSize: "0.5625rem" }}>·</Typography>
                            <Typography variant="bodySmall" color="text.secondary" sx={{ fontSize: "0.6875rem" }}>
                              {LANGUAGE_FLAGS[p.langue]} {p.ville}
                            </Typography>
                          </Box>
                        </Box>
                        {i < outreachProspects.length - 1 && <Divider />}
                      </React.Fragment>
                    );
                  })}
                </Box>
              )}
            </CardContent>
          </Card>
        )}

        {/* Commission Potential + Recent Additions */}
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>

          {loading ? <CardSkeleton height={110} /> : (
            <Card elevation={0} variant="outlined" sx={{ borderRadius: 3 }}>
              <CardContent sx={{ p: 2.5 }}>
                <SectionTitle>
                  <TrendingUpRoundedIcon sx={{ color: "success.main", fontSize: 20 }} />
                  Potentiel commercial
                </SectionTitle>

                <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5, mb: 1.5 }}>
                  <Box
                    sx={{
                      p: 1.5, borderRadius: 2, textAlign: "center",
                      bgcolor: alpha(theme.palette.warning.main, 0.07),
                      border: `1px solid ${alpha(theme.palette.warning.main, 0.2)}`,
                    }}
                  >
                    <Typography sx={{ fontWeight: 800, fontSize: "1.5rem", lineHeight: 1, color: "warning.main" }}>
                      {closingPartners.length}
                    </Typography>
                    <Typography variant="labelSmall" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>
                      En closing
                    </Typography>
                    <Typography variant="labelSmall" sx={{ color: "warning.main", fontWeight: 700 }}>
                      moy. {avgCommClosing}%
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      p: 1.5, borderRadius: 2, textAlign: "center",
                      bgcolor: alpha(theme.palette.success.main, 0.07),
                      border: `1px solid ${alpha(theme.palette.success.main, 0.2)}`,
                    }}
                  >
                    <Typography sx={{ fontWeight: 800, fontSize: "1.5rem", lineHeight: 1, color: "success.main" }}>
                      {activatedPartners.length}
                    </Typography>
                    <Typography variant="labelSmall" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>
                      Actif OTA
                    </Typography>
                    <Typography variant="labelSmall" sx={{ color: "success.main", fontWeight: 700 }}>
                      {activatedPartners.map((p) => p.commissionStandard).join("% / ")}%
                    </Typography>
                  </Box>
                </Box>
                <Typography variant="bodySmall" color="text.disabled" sx={{ fontSize: "0.6875rem" }}>
                  Volume de revenus disponible au lancement de babmorocco.com
                </Typography>
              </CardContent>
            </Card>
          )}

          {loading ? <CardSkeleton height={160} /> : (
            <Card elevation={0} variant="outlined" sx={{ borderRadius: 3, flex: 1 }}>
              <CardContent sx={{ p: 2.5 }}>
                <SectionTitle>
                  <CalendarTodayOutlinedIcon sx={{ color: "info.main", fontSize: 20 }} />
                  Derniers ajouts
                </SectionTitle>

                <Box sx={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {recentProspects.map((p, i) => (
                    <React.Fragment key={p.id}>
                      <Box sx={{ py: 0.875, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1 }}>
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography
                            variant="bodySmall"
                            sx={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                          >
                            {p.nom}
                          </Typography>
                          <Typography variant="bodySmall" color="text.secondary" sx={{ fontSize: "0.6875rem" }}>
                            {p.dateAjout} · {p.ville}
                          </Typography>
                        </Box>
                        <Chip
                          label={STAGE_LABELS[p.stage]}
                          size="small"
                          sx={{ height: 16, fontSize: "0.5625rem", "& .MuiChip-label": { px: 0.5 }, flexShrink: 0 }}
                        />
                      </Box>
                      {i < recentProspects.length - 1 && <Divider />}
                    </React.Fragment>
                  ))}

                  {recentProspects.length === 0 && (
                    <Typography variant="bodySmall" color="text.disabled" sx={{ py: 1, textAlign: "center" }}>
                      Aucun prospect.
                    </Typography>
                  )}
                </Box>
              </CardContent>
            </Card>
          )}
        </Box>
      </Box>

    </Box>
  );
}
