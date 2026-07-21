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
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import LinearProgress from "@mui/material/LinearProgress";
import DataUsageRoundedIcon from "@mui/icons-material/DataUsageRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import SpeedRoundedIcon from "@mui/icons-material/SpeedRounded";
import TokenRoundedIcon from "@mui/icons-material/TokenRounded";
import SyncAltRoundedIcon from "@mui/icons-material/SyncAltRounded";
import { alpha } from "@mui/material/styles";

import { apiSettingsApi, type ApiUsageResponse, type ApiUsageByModel } from "@/lib/api";

const MONTHLY_LIMIT_KEY = "monthly_token_limit";

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

const PROVIDER_LABELS: Record<string, string> = {
  claude: "Claude",
  openai: "OpenAI",
};

const PROVIDER_COLORS: Record<string, string> = {
  claude: "var(--mui-palette-primary-main, #6750A4)",
  openai: "var(--mui-palette-success-main, #2E7D32)",
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

  // Monthly limit — independent of the period selector above, always tied to the
  // current calendar month (matches the backend's monthly cap semantics).
  const [monthTotal, setMonthTotal] = useState(0);
  const [limit, setLimit] = useState<number | null>(null);
  const [limitInput, setLimitInput] = useState("");
  const [limitLoading, setLimitLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [limitError, setLimitError] = useState<string | null>(null);

  const load = useCallback(async (p: Period) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiSettingsApi.usage(p);
      setData(res);
      if (p === "month") setMonthTotal(res.total_tokens);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLimit = useCallback(async () => {
    setLimitLoading(true);
    try {
      const [settings, monthUsage] = await Promise.all([
        apiSettingsApi.getSettings(),
        apiSettingsApi.usage("month"),
      ]);
      const raw = settings[MONTHLY_LIMIT_KEY];
      const parsed = raw ? parseInt(raw, 10) : 0;
      setLimit(parsed > 0 ? parsed : null);
      setLimitInput(parsed > 0 ? String(parsed) : "");
      setMonthTotal(monthUsage.total_tokens);
    } catch {
      // Limit is a nice-to-have — silently degrade to "unlimited" display on failure.
    } finally {
      setLimitLoading(false);
    }
  }, []);

  useEffect(() => {
    load(period);
  }, [period, load]);

  useEffect(() => {
    loadLimit();
  }, [loadLimit]);

  async function handleSaveLimit() {
    setSaving(true);
    setLimitError(null);
    try {
      const value = limitInput.trim() === "" ? 0 : parseInt(limitInput, 10);
      const res = await apiSettingsApi.updateSettings({ [MONTHLY_LIMIT_KEY]: value });
      const raw = res[MONTHLY_LIMIT_KEY];
      const parsed = raw ? parseInt(raw, 10) : 0;
      setLimit(parsed > 0 ? parsed : null);
      setLimitInput(parsed > 0 ? String(parsed) : "");
    } catch (e: unknown) {
      setLimitError(e instanceof Error ? e.message : "Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  }

  const limitPct = limit ? Math.min(100, (monthTotal / limit) * 100) : 0;
  const limitColor = limitPct >= 95 ? "error" : limitPct >= 80 ? "warning" : "primary";

  const generatorRows = data
    ? Object.entries(data.by_generator).sort(([, a], [, b]) => b.total_tokens - a.total_tokens)
    : [];

  const providerRows = data
    ? Object.entries(data.by_provider).sort(([, a], [, b]) => b.total_tokens - a.total_tokens)
    : [];

  return (
    <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden", mb: 3 }}>
      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 2.5, py: 2, bgcolor: "action.hover" }}>
        <DataUsageRoundedIcon sx={{ color: "primary.main", fontSize: 22 }} />
        <Typography variant="titleMedium" sx={{ fontWeight: 700, flex: 1 }}>
          Consommation API IA
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
            [
              { label: "Tokens totaux", value: fmtNum(data.total_tokens), icon: <TokenRoundedIcon />, color: "primary" as const },
              { label: "Appels API", value: fmtNum(data.total_calls), icon: <SyncAltRoundedIcon />, color: "info" as const },
              { label: "Appels en erreur", value: data.failed_calls, icon: <ErrorOutlineRoundedIcon />, color: data.failed_calls > 0 ? "error" as const : "grey" as const },
            ].map(({ label, value, icon, color }) => (
              <Paper
                key={label}
                variant="outlined"
                sx={{ px: 2.5, py: 2, borderRadius: 3, display: "flex", alignItems: "center", gap: 2 }}
              >
                <Box sx={(t) => ({
                  width: 44, height: 44, borderRadius: 2,
                  bgcolor: color === "grey" ? alpha(t.palette.text.secondary, 0.1) : alpha(t.palette[color].main, 0.12),
                  color: color === "grey" ? "text.secondary" : `${color}.main`,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                })}>
                  {React.cloneElement(icon, { sx: { fontSize: 22 } })}
                </Box>
                <Box>
                  <Typography sx={{ fontSize: "1.5rem", fontWeight: 800, lineHeight: 1, color: color === "grey" ? "text.primary" : `${color}.main` }}>
                    {value}
                  </Typography>
                  <Typography variant="bodySmall" color="text.secondary" sx={{ mt: 0.5 }}>
                    {label}
                  </Typography>
                </Box>
              </Paper>
            ))
          ) : null}
        </Box>

        {/* Per-provider breakdown */}
        {loading ? (
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 2, mb: 2.5 }}>
            <Skeleton variant="rounded" height={72} />
            <Skeleton variant="rounded" height={72} />
          </Box>
        ) : providerRows.length > 0 ? (
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 2, mb: 2.5 }}>
            {providerRows.map(([provider, stats]) => {
              const provColor = PROVIDER_COLORS[provider] || "var(--mui-palette-text-primary)";
              const models: ApiUsageByModel[] = data?.by_model?.[provider] || [];
              return (
                <Paper
                  key={provider}
                  variant="outlined"
                  sx={{
                    px: 2.5,
                    py: 2,
                    borderRadius: 3,
                    borderLeft: 4,
                    borderLeftColor: provColor,
                  }}
                >
                  <Box>
                    <Typography variant="labelMedium" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>
                      {PROVIDER_LABELS[provider] || provider}
                    </Typography>
                    <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
                      <Typography sx={{ fontSize: "1.35rem", fontWeight: 800, lineHeight: 1, color: provColor }}>
                        {fmtNum(stats.total_tokens)}
                      </Typography>
                      <Typography variant="bodySmall" color="text.disabled">tokens</Typography>
                    </Box>
                    <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.75, mt: 0.5 }}>
                      <Typography sx={{ fontSize: "0.9rem", fontWeight: 700, lineHeight: 1, color: provColor }}>
                        {fmtNum(stats.calls)}
                      </Typography>
                      <Typography variant="bodySmall" color="text.disabled">
                        appel{stats.calls > 1 ? "s" : ""}
                      </Typography>
                    </Box>
                  </Box>

                  {models.length > 0 && (
                    <Box sx={{ mt: 1.5, pt: 1.5, borderTop: 1, borderColor: "divider" }}>
                      {models
                        .sort((a, b) => b.total_tokens - a.total_tokens)
                        .map((m) => (
                        <Box
                          key={m.model}
                          sx={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            py: 0.5,
                          }}
                        >
                          <Typography variant="bodySmall" color="text.secondary" sx={{ fontWeight: 500 }}>
                            {m.model}
                          </Typography>
                          <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.5 }}>
                            <Typography variant="bodySmall" sx={{ fontWeight: 700 }}>
                              {fmtNum(m.total_tokens)}
                            </Typography>
                            <Typography variant="bodySmall" color="text.disabled" sx={{ fontSize: "0.65rem" }}>
                              ({m.calls})
                            </Typography>
                          </Box>
                        </Box>
                      ))}
                    </Box>
                  )}
                </Paper>
              );
            })}
          </Box>
        ) : null}

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

        {/* Monthly limit */}
        <Divider sx={{ my: 2.5 }} />
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
          <SpeedRoundedIcon sx={{ color: "primary.main", fontSize: 20 }} />
          <Typography variant="titleSmall" sx={{ fontWeight: 700 }}>
            Limite mensuelle
          </Typography>
          {!limitLoading && (
            <Chip
              label={limit ? "Limite active" : "Illimité"}
              size="small"
              color={limit ? "primary" : "default"}
              variant={limit ? "filled" : "outlined"}
              sx={{ ml: "auto" }}
            />
          )}
        </Box>

        {limitLoading ? (
          <Skeleton variant="rounded" height={56} />
        ) : (
          <>
            {limit && (
              <Box sx={{ mb: 2 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                  <Typography variant="bodySmall" color="text.secondary">
                    {fmtNum(monthTotal)} / {fmtNum(limit)} tokens utilisés ce mois
                  </Typography>
                  <Typography variant="bodySmall" sx={{ fontWeight: 700 }} color={`${limitColor}.main`}>
                    {limitPct.toFixed(0)}%
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={limitPct}
                  color={limitColor}
                  sx={{ height: 8, borderRadius: 4 }}
                />
              </Box>
            )}

            {limitError && (
              <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
                {limitError}
              </Alert>
            )}

            <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap" }}>
              <TextField
                size="small"
                type="number"
                label="Limite (tokens / mois)"
                placeholder="Illimité"
                value={limitInput}
                onChange={(e) => setLimitInput(e.target.value)}
                disabled={saving}
                sx={{ maxWidth: 220 }}
              />
              <Button
                variant="contained"
                size="small"
                onClick={handleSaveLimit}
                disabled={saving}
                sx={{ fontWeight: 700, textTransform: "none" }}
              >
                {saving ? "Enregistrement…" : "Enregistrer"}
              </Button>
              {limit && (
                <Button
                  variant="text"
                  size="small"
                  color="inherit"
                  disabled={saving}
                  onClick={() => { setLimitInput(""); }}
                  sx={{ textTransform: "none" }}
                >
                  Laisser vide + Enregistrer = illimité
                </Button>
              )}
            </Box>
          </>
        )}
      </Box>
    </Paper>
  );
}
