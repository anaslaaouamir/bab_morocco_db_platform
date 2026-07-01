"use client";

import React, { useState, useMemo } from "react";
import Box from "@mui/material/Box";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TablePagination from "@mui/material/TablePagination";
import TableRow from "@mui/material/TableRow";
import TableSortLabel from "@mui/material/TableSortLabel";
import Paper from "@mui/material/Paper";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import Tooltip from "@mui/material/Tooltip";
import LinearProgress from "@mui/material/LinearProgress";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import SearchIcon from "@mui/icons-material/Search";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import { alpha, useTheme } from "@mui/material/styles";

import type { Prospect, PipelineStage, PartnerType } from "@/types/prospect";
import {
  scoreTotal,
  scoreColor,
  PARTNER_TYPE_LABELS,
  STAGE_LABELS,
  LANGUAGE_FLAGS,
} from "@/types/prospect";

// ─── Stage / Type colour maps ──────────────────────────────────────────────

const STAGE_COLORS: Record<
  PipelineStage,
  "default" | "primary" | "info" | "warning" | "secondary" | "success" | "error"
> = {
  prospection: "default",
  qualification: "info",
  outreach: "warning",
  negociation: "secondary",
  closing: "success",
  activation_ota: "success",
  veille: "default",
  perdu: "error",
};

const TYPE_COLORS: Record<
  PartnerType,
  "default" | "primary" | "secondary" | "info" | "warning" | "success" | "error"
> = {
  hotel_riad: "primary",
  hotel_luxe: "warning",
  tour_operateur: "info",
  agence_voyage: "secondary",
  prestataire_activites: "success",
  transport: "default",
  to_golfe: "warning",
  mice: "secondary",
};

// ─── Sorting ───────────────────────────────────────────────────────────────

type SortKey = "nom" | "ville" | "score" | "stage" | "commissionStandard" | "dateAjout";
type SortOrder = "asc" | "desc";

function getComparable(p: Prospect, key: SortKey): string | number {
  switch (key) {
    case "score":               return scoreTotal(p.score);
    case "nom":                 return p.nom.toLowerCase();
    case "ville":               return p.ville.toLowerCase();
    case "stage":               return STAGE_LABELS[p.stage];
    case "commissionStandard":  return p.commissionStandard;
    case "dateAjout":           return p.dateAjout;
  }
}

function stableSort(rows: Prospect[], key: SortKey, order: SortOrder): Prospect[] {
  return [...rows].sort((a, b) => {
    const av = getComparable(a, key);
    const bv = getComparable(b, key);
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return order === "asc" ? cmp : -cmp;
  });
}

// ─── Score cell ────────────────────────────────────────────────────────────

function ScoreCell({ prospect }: { prospect: Prospect }) {
  const theme = useTheme();
  const total = scoreTotal(prospect.score);
  const color = scoreColor(total);
  const muiColor = theme.palette[color].main;

  const tooltipContent = (
    <Box sx={{ p: 0.5, minWidth: 180 }}>
      <Typography variant="labelSmall" sx={{ display: "block", mb: 0.5, opacity: 0.7 }}>
        Détail du score
      </Typography>
      {(
        [
          ["Activité digitale", prospect.score.activiteDigitale, 25],
          ["Cohérence marché",  prospect.score.coherenceMarche,  25],
          ["Taille & capacité", prospect.score.tailleCapacite,   20],
          ["Contact décideur",  prospect.score.contactDecideur,  15],
          ["Liberté OTA",       prospect.score.liberteOta,       15],
        ] as [string, number, number][]
      ).map(([label, val, max]) => (
        <Box
          key={label}
          sx={{ display: "flex", justifyContent: "space-between", gap: 2, py: 0.25 }}
        >
          <Typography variant="bodySmall">{label}</Typography>
          <Typography variant="bodySmall" sx={{ fontWeight: 600 }}>
            {val}/{max}
          </Typography>
        </Box>
      ))}
    </Box>
  );

  return (
    <Tooltip title={tooltipContent} placement="right" arrow>
      <Box sx={{ minWidth: 80 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
          <Typography
            component="span"
            sx={{ fontWeight: 700, fontSize: "0.9375rem", color: muiColor }}
          >
            {total}
          </Typography>
          <Typography component="span" variant="bodySmall" color="text.secondary">
            /100
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={total}
          sx={{
            height: 4,
            borderRadius: 2,
            bgcolor: alpha(muiColor, 0.15),
            "& .MuiLinearProgress-bar": { bgcolor: muiColor, borderRadius: 2 },
          }}
        />
      </Box>
    </Tooltip>
  );
}

// ─── Column headers ────────────────────────────────────────────────────────

const COLUMNS: { id: SortKey; label: string; align?: "right" }[] = [
  { id: "nom",                label: "Partenaire" },
  { id: "ville",              label: "Localisation" },
  { id: "score",              label: "Score",      align: "right" },
  { id: "stage",              label: "Pipeline" },
  { id: "commissionStandard", label: "Commission", align: "right" },
  { id: "dateAjout",          label: "Ajouté le" },
];

// ─── Props ─────────────────────────────────────────────────────────────────

export interface ProspectTableProps {
  /** Pre-filtered by FilterBar chips at the page level. */
  prospects: Prospect[];
  /** Called when a row is clicked to open the Fiche Partenaire drawer. */
  onProspectClick?: (prospect: Prospect) => void;
  /** When true, shows the Responsable column (assigned commercial name). */
  isAdmin?: boolean;
}

// ─── Main component ────────────────────────────────────────────────────────

export default function ProspectTable({ prospects, onProspectClick, isAdmin = false }: ProspectTableProps) {
  const [orderBy, setOrderBy] = useState<SortKey>("score");
  const [order,   setOrder]   = useState<SortOrder>("desc");
  const [page,    setPage]    = useState(0);
  const [search,  setSearch]  = useState("");
  const rowsPerPage = 10;

  function handleSort(col: SortKey) {
    if (col === orderBy) {
      setOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setOrderBy(col);
      setOrder("desc");
    }
    setPage(0);
  }

  // Text search applied on top of the chip-filtered `prospects` prop
  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return prospects;
    return prospects.filter(
      (p) =>
        p.nom.toLowerCase().includes(q) ||
        p.ville.toLowerCase().includes(q) ||
        p.pays.toLowerCase().includes(q) ||
        STAGE_LABELS[p.stage].toLowerCase().includes(q) ||
        PARTNER_TYPE_LABELS[p.type].toLowerCase().includes(q)
    );
  }, [prospects, search]);

  const sorted = useMemo(
    () => stableSort(searched, orderBy, order),
    [searched, orderBy, order]
  );

  // Reset to page 0 whenever the upstream filter changes row count
  const visiblePage = Math.min(page, Math.max(0, Math.ceil(sorted.length / rowsPerPage) - 1));
  const paginated = sorted.slice(
    visiblePage * rowsPerPage,
    visiblePage * rowsPerPage + rowsPerPage
  );

  return (
    <Box>
      {/* Search bar — narrows further within the already-chip-filtered list */}
      <Box sx={{ px: { xs: 2, md: 4 }, pb: 2 }}>
        <TextField
          size="small"
          placeholder="Rechercher nom, ville, étape…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" sx={{ color: "text.secondary" }} />
                </InputAdornment>
              ),
            },
          }}
          sx={{ width: { xs: "100%", sm: 360 } }}
        />
      </Box>

      <TableContainer
        component={Paper}
        elevation={0}
        variant="outlined"
        sx={{ borderRadius: 2, mx: { xs: 2, md: 4 }, width: "auto", overflowX: "auto" }}
      >
        <Table size="small" stickyHeader aria-label="CRM Prospects">
          <TableHead>
            <TableRow sx={{ "& th": { bgcolor: "background.paper" } }}>
              {COLUMNS.map((col) => (
                <TableCell
                  key={col.id}
                  align={col.align}
                  sortDirection={orderBy === col.id ? order : false}
                  sx={{
                    whiteSpace: "nowrap",
                    py: 1.5,
                    ...(col.id === "nom"
                      ? {
                          position: "sticky",
                          left: 0,
                          zIndex: 4,
                          bgcolor: "background.paper",
                          borderRight: 1,
                          borderRightColor: "divider",
                        }
                      : {}),
                  }}
                >
                  <TableSortLabel
                    active={orderBy === col.id}
                    direction={orderBy === col.id ? order : "desc"}
                    onClick={() => handleSort(col.id)}
                  >
                    <Typography variant="labelMedium" sx={{ fontWeight: 700 }}>
                      {col.label}
                    </Typography>
                  </TableSortLabel>
                </TableCell>
              ))}
              {/* Non-sortable columns */}
              {(isAdmin ? ["Responsable", "Type", "OTAs", "Langue"] : ["Type", "OTAs", "Langue"]).map((h) => (
                <TableCell key={h} sx={{ py: 1.5 }}>
                  <Typography variant="labelMedium" sx={{ fontWeight: 700 }}>
                    {h}
                  </Typography>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>

          <TableBody>
            {paginated.map((prospect) => {
              const isOverdue =
                prospect.dateProchainContact != null &&
                prospect.dateProchainContact < "2026-06-24" &&
                prospect.stage !== "veille" &&
                prospect.stage !== "perdu";

              return (
              <TableRow
                key={prospect.id}
                hover
                onClick={() => onProspectClick?.(prospect)}
                sx={{
                  cursor: onProspectClick ? "pointer" : "default",
                  "&:last-child td": { borderBottom: 0 },
                }}
              >
                {/* Partenaire — sticky first column */}
                <TableCell
                  sx={{
                    py: 1.25,
                    maxWidth: 220,
                    position: "sticky",
                    left: 0,
                    zIndex: 1,
                    bgcolor: "background.paper",
                    borderRight: 1,
                    borderRightColor: "divider",
                  }}
                >
                  <Typography variant="bodySmall" sx={{ fontWeight: 600, display: "block" }}>
                    {prospect.nom}
                  </Typography>
                  <Typography variant="bodySmall" color="text.secondary">
                    {prospect.nomContact} · {prospect.posteContact}
                  </Typography>
                </TableCell>

                {/* Localisation */}
                <TableCell sx={{ py: 1.25, whiteSpace: "nowrap" }}>
                  <Typography variant="bodySmall" sx={{ display: "block" }}>
                    {prospect.ville}
                  </Typography>
                  <Typography variant="bodySmall" color="text.secondary">
                    {prospect.pays}
                  </Typography>
                </TableCell>

                {/* Score */}
                <TableCell align="right" sx={{ py: 1.25, width: 100 }}>
                  <ScoreCell prospect={prospect} />
                </TableCell>

                {/* Pipeline */}
                <TableCell sx={{ py: 1.25 }}>
                  <Chip
                    label={STAGE_LABELS[prospect.stage]}
                    color={STAGE_COLORS[prospect.stage]}
                    size="small"
                    variant={prospect.stage === "activation_ota" ? "filled" : "outlined"}
                    sx={{ fontWeight: 600, fontSize: "0.6875rem" }}
                  />
                </TableCell>

                {/* Commission */}
                <TableCell align="right" sx={{ py: 1.25, whiteSpace: "nowrap" }}>
                  <Typography variant="bodySmall" sx={{ fontWeight: 700 }}>
                    {prospect.commissionStandard}%
                  </Typography>
                  <Typography variant="bodySmall" color="text.secondary">
                    plancher {prospect.commissionPlancher}%
                  </Typography>
                </TableCell>

                {/* Date ajouté + prochain contact */}
                <TableCell sx={{ py: 1.25, whiteSpace: "nowrap" }}>
                  <Typography variant="bodySmall" color="text.secondary">
                    {new Date(prospect.dateAjout).toLocaleDateString("fr-FR", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </Typography>
                  {prospect.dateProchainContact && (
                    <Tooltip
                      title={
                        isOverdue
                          ? `Prochain contact en retard — prévu le ${prospect.dateProchainContact}`
                          : `Prochain contact : ${prospect.dateProchainContact}`
                      }
                      placement="left"
                    >
                      <Typography
                        variant="labelSmall"
                        sx={{
                          display: "block",
                          mt: 0.25,
                          fontWeight: isOverdue ? 700 : 500,
                          color: isOverdue ? "error.main" : "text.secondary",
                        }}
                      >
                        {isOverdue ? "⚠ " : ""}
                        {prospect.dateProchainContact}
                      </Typography>
                    </Tooltip>
                  )}
                </TableCell>

                {/* Responsable (admin only) */}
                {isAdmin && (
                  <TableCell sx={{ py: 1.25, whiteSpace: "nowrap" }}>
                    {prospect.assignedToName ? (
                      <Chip
                        label={prospect.assignedToName}
                        size="small"
                        variant="outlined"
                        sx={{ fontSize: "0.6875rem", fontWeight: 600 }}
                      />
                    ) : (
                      <Typography variant="bodySmall" color="text.disabled">—</Typography>
                    )}
                  </TableCell>
                )}

                {/* Type */}
                <TableCell sx={{ py: 1.25 }}>
                  <Chip
                    label={PARTNER_TYPE_LABELS[prospect.type]}
                    color={TYPE_COLORS[prospect.type]}
                    size="small"
                    sx={{ fontSize: "0.6875rem" }}
                  />
                </TableCell>

                {/* OTAs */}
                <TableCell sx={{ py: 1.25 }}>
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
                    {[
                      { present: prospect.presenceBooking, label: `Booking${prospect.noteBooking ? ` ${prospect.noteBooking}` : ""}` },
                      { present: prospect.presenceExpedia, label: "Expedia" },
                    ].map(({ present, label }) => (
                      <Box key={label} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                        {present ? (
                          <CheckIcon sx={{ fontSize: 14, color: "success.main" }} />
                        ) : (
                          <CloseIcon sx={{ fontSize: 14, color: "text.disabled" }} />
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
                </TableCell>

                {/* Langue */}
                <TableCell sx={{ py: 1.25 }}>
                  <Tooltip title={prospect.langue.toUpperCase()} placement="left">
                    <Typography component="span" sx={{ fontSize: "1.25rem", lineHeight: 1 }}>
                      {LANGUAGE_FLAGS[prospect.langue]}
                    </Typography>
                  </Tooltip>
                </TableCell>
              </TableRow>
              );
            })}

            {paginated.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} align="center" sx={{ py: 6 }}>
                  <Typography variant="bodyMedium" color="text.secondary">
                    Aucun partenaire ne correspond aux filtres actifs.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <TablePagination
          component="div"
          count={sorted.length}
          rowsPerPage={rowsPerPage}
          page={visiblePage}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPageOptions={[rowsPerPage]}
          labelDisplayedRows={({ from, to, count }) =>
            `${from}–${to} sur ${count} partenaires`
          }
        />
      </TableContainer>
    </Box>
  );
}
