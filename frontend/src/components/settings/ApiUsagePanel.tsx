"use client";

import React, { useCallback, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
import Chip from "@mui/material/Chip";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Skeleton from "@mui/material/Skeleton";
import Alert from "@mui/material/Alert";
import DataUsageRoundedIcon from "@mui/icons-material/DataUsageRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";

import { apiSettingsApi, type ApiUsageResponse } from "@/lib/api";

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  return n.toLocaleString("fr-FR");
}

const GENERATOR_LABELS: Record<string, string> = {
  email: "Email outreach",
  negotiation_analyze: "Analyse négociation",
  negotiation_scenarios: "Scénarios négociation",
  contract: "Contrat",
};

type Period = "today" | "week" | "month";

const PERIOD_LABELS: Record<Period, string> = {
  today: "Aujourd'hui",
  week: "Cette semaine",
  month: "Ce mois",
};

// ─── Daily chart (lightweight inline SVG) ───────────────────────────────────

function DailyChart({ data }: { data: { date: string; total_tokens: number }[] }) {
  if (!data.length) return null;
  const max = Math.max(...data.map((d) => d.total_tokens), 1);
  const barW = Math.max(8, Math.min(32, Math.floor(500 / data.length) - 4));
  const chartH = 120;
  const totalW = data.length * (barW + 4);

  return (
    <Box sx={{ overflowX: "auto", mt: 2 }}>
      <svg
        width={Math.max(totalW, 200)}
        height={chartH + 24}
        viewBox={`0 0 ${Math.max(totalW, 200)} ${chartH + 24}`}
        style={{ display: "block" }}
      >
        {data.map((d, i) => {
          const h = Math.max(2, (d.total_tokens / max) * chartH);
          const x = i * (barW + 4);
          const y = chartH - h;
          return (
            <g key={d.date}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={h}
                rx={3}
                fill="var(--mui-palette-primary-main, #6750A4)"
                opacity={0.85}
              >
                <title>{`${d.date}: ${fmtNum(d.total_tokens)} tokens`}</title>
              </rect>
              {data.length <= 14 && (
                <text
                  x={x + barW / 2}
                  y={chartH + 14}
                  textAnchor="middle"
                  fontSize={9}
                  fill="var(--mui-palette-text-secondary, #666)"
                >
                  {d.date.slice(5)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </Box>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function ApiUsagePanel() {
  const [period, setPeriod] = useState<Period>("month");
  const [data, setData] = useState<ApiUsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (p: Period) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiSettingsApi.usage(p);
      setData(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(period);
  }, [period, load]);

  const generatorRows = data
    ? Object.entries(data.by_generator).sort(([, a], [, b]) => b.total_tokens - a.total_tokens)
    : [];

  return (
    <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden", mb: 3 }}>
      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 2.5, py: 2, bgcolor: "action.hover" }}>
        <DataUsageRoundedIcon sx={{ color: "primary.main", fontSize: 22 }} />
        <Typography variant="titleMedium" sx={{ fontWeight: 700, flex: 1 }}>
          Consommation API Claude
        </Typography>
        <Box sx={{ display: "flex", gap: 0.5 }}>
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <Chip
              key={p}
              label={PERIOD_LABELS[p]}
              size="small"
              color={period === p ? "primary" : "default"}
              variant={period === p ? "filled" : "outlined"}
              onClick={() => setPeriod(p)}
              sx={{ fontWeight: period === p ? 700 : 400 }}
            />
          ))}
        </Box>
      </Box>

      <Divider />

      <Box sx={{ px: 2.5, py: 2.5 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
            {error}
          </Alert>
        )}

        {/* Summary cards */}
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2, mb: 2.5 }}>
          {loading ? (
            <>
              <Skeleton variant="rounded" height={72} />
              <Skeleton variant="rounded" height={72} />
              <Skeleton variant="rounded" height={72} />
            </>
          ) : data ? (
            <>
              <Paper
                variant="outlined"
                sx={{ px: 2, py: 1.5, borderRadius: 2, textAlign: "center" }}
              >
                <Typography variant="bodySmall" color="text.secondary">
                  Tokens totaux
                </Typography>
                <Typography variant="headlineSmall" sx={{ fontWeight: 700 }}>
                  {fmtNum(data.total_tokens)}
                </Typography>
              </Paper>
              <Paper
                variant="outlined"
                sx={{ px: 2, py: 1.5, borderRadius: 2, textAlign: "center" }}
              >
                <Typography variant="bodySmall" color="text.secondary">
                  Appels API
                </Typography>
                <Typography variant="headlineSmall" sx={{ fontWeight: 700 }}>
                  {fmtNum(data.total_calls)}
                </Typography>
              </Paper>
              <Paper
                variant="outlined"
                sx={{
                  px: 2,
                  py: 1.5,
                  borderRadius: 2,
                  textAlign: "center",
                  borderColor: data.failed_calls > 0 ? "error.main" : undefined,
                }}
              >
                <Typography variant="bodySmall" color="text.secondary">
                  Appels en erreur
                </Typography>
                <Typography
                  variant="headlineSmall"
                  sx={{ fontWeight: 700 }}
                  color={data.failed_calls > 0 ? "error.main" : "text.primary"}
                >
                  {data.failed_calls}
                  {data.failed_calls > 0 && (
                    <ErrorOutlineRoundedIcon sx={{ fontSize: 18, ml: 0.5, verticalAlign: "text-top" }} />
                  )}
                </Typography>
              </Paper>
            </>
          ) : null}
        </Box>

        {/* Per-generator breakdown */}
        {loading ? (
          <Skeleton variant="rounded" height={160} />
        ) : generatorRows.length > 0 ? (
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small" sx={{ "& th": { fontWeight: 700, fontSize: "0.75rem" } }}>
              <TableHead>
                <TableRow>
                  <TableCell>Générateur</TableCell>
                  <TableCell align="right">Appels</TableCell>
                  <TableCell align="right">Input</TableCell>
                  <TableCell align="right">Output</TableCell>
                  <TableCell align="right">Total</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {generatorRows.map(([gen, stats]) => (
                  <TableRow key={gen}>
                    <TableCell>{GENERATOR_LABELS[gen] || gen}</TableCell>
                    <TableCell align="right">{fmtNum(stats.calls)}</TableCell>
                    <TableCell align="right">{fmtNum(stats.input_tokens)}</TableCell>
                    <TableCell align="right">{fmtNum(stats.output_tokens)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      {fmtNum(stats.total_tokens)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        ) : !error ? (
          <Alert severity="info" sx={{ borderRadius: 2 }}>
            Aucun appel API enregistré pour cette période.
          </Alert>
        ) : null}

        {/* Daily chart */}
        {!loading && data && data.daily_breakdown.length > 0 && (
          <>
            <Typography variant="labelMedium" color="text.secondary" sx={{ mt: 2.5, mb: 0.5, display: "block" }}>
              Tokens par jour
            </Typography>
            <DailyChart data={data.daily_breakdown} />
          </>
        )}
      </Box>
    </Paper>
  );
}
