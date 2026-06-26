"use client";

import React, { useState } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Collapse from "@mui/material/Collapse";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Tooltip from "@mui/material/Tooltip";
import Badge from "@mui/material/Badge";
import { alpha, useTheme } from "@mui/material/styles";
import FilterListRoundedIcon from "@mui/icons-material/FilterListRounded";
import KeyboardArrowUpRoundedIcon from "@mui/icons-material/KeyboardArrowUpRounded";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";

import type { PartnerType, PipelineStage } from "@/types/prospect";
import {
  PARTNER_TYPE_LABELS,
  STAGE_LABELS,
} from "@/types/prospect";
import {
  type FilterState,
  EMPTY_FILTERS,
  countActiveFilters,
  hasActiveFilters,
  toggleItem,
} from "@/lib/filters";

// ─── Static option lists ───────────────────────────────────────────────────

const PARTNER_TYPES: PartnerType[] = [
  "hotel_riad",
  "hotel_luxe",
  "tour_operateur",
  "agence_voyage",
  "prestataire_activites",
  "transport",
  "to_golfe",
  "mice",
];

const PIPELINE_STAGES: PipelineStage[] = [
  "prospection",
  "qualification",
  "outreach",
  "negociation",
  "closing",
  "activation_ota",
  "veille",
  "perdu",
];

const MARCHES = ["Maroc", "France", "EAU", "Golfe"] as const;

const SCORE_OPTIONS: { label: string; value: 75 | 85; color: "warning" | "success" }[] = [
  { label: "≥ 75  Qualifié", value: 75, color: "warning" },
  { label: "≥ 85  Prioritaire", value: 85, color: "success" },
];

// Stage chip colours (mirrors table/kanban palette)
const STAGE_CHIP_COLORS: Record<
  PipelineStage,
  "default" | "info" | "warning" | "secondary" | "success" | "error"
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

// ─── Group label ───────────────────────────────────────────────────────────

function GroupLabel({ children }: { children: string }) {
  return (
    <Typography
      component="span"
      sx={{
        fontSize: "0.625rem",
        fontWeight: 800,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "text.disabled",
        minWidth: 56,
        flexShrink: 0,
        pt: "5px", // vertically align with chip text
        userSelect: "none",
      }}
    >
      {children}
    </Typography>
  );
}

// ─── Single filter chip ────────────────────────────────────────────────────

interface FilterChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
  color?: "default" | "primary" | "info" | "warning" | "secondary" | "success" | "error";
}

function FilterChip({ label, active, onClick, color = "default" }: FilterChipProps) {
  const theme = useTheme();
  // Use primary for all active chips for visual consistency,
  // unless a specific colour is passed and the chip is active.
  const resolvedColor = active ? (color === "default" ? "primary" : color) : "default";

  return (
    <Chip
      label={label}
      size="small"
      onClick={onClick}
      color={resolvedColor}
      variant={active ? "filled" : "outlined"}
      sx={{
        height: 26,
        fontSize: "0.6875rem",
        fontWeight: active ? 700 : 500,
        cursor: "pointer",
        transition: "all 150ms ease",
        "&:hover": {
          bgcolor: active
            ? undefined
            : (th) => alpha(th.palette.primary.main, 0.08),
        },
        "& .MuiChip-label": { px: 1 },
      }}
    />
  );
}

// ─── Props ─────────────────────────────────────────────────────────────────

export interface FilterBarProps {
  value: FilterState;
  onChange: (next: FilterState) => void;
  /** Total prospects before filtering — shown in summary line. */
  totalCount: number;
  /** Prospects after filtering — shown in summary line. */
  filteredCount: number;
}

// ─── Main component ────────────────────────────────────────────────────────

export default function FilterBar({
  value,
  onChange,
  totalCount,
  filteredCount,
}: FilterBarProps) {
  const [expanded, setExpanded] = useState(false);
  const activeCount = countActiveFilters(value);
  const isFiltered = hasActiveFilters(value);

  // ── Toggle helpers ──────────────────────────────────────────────────────

  function toggleType(t: PartnerType) {
    onChange({ ...value, types: toggleItem(value.types, t) });
  }

  function toggleStage(s: PipelineStage) {
    onChange({ ...value, stages: toggleItem(value.stages, s) });
  }

  function toggleScore(score: 75 | 85) {
    onChange({ ...value, scoreMin: value.scoreMin === score ? null : score });
  }

  function toggleMarche(m: string) {
    onChange({ ...value, marches: toggleItem(value.marches, m) });
  }

  function clearAll() {
    onChange(EMPTY_FILTERS);
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <Box
      sx={{
        px: { xs: 2, md: 4 },
        py: 1,
        bgcolor: "background.paper",
        borderBottom: 1,
        borderColor: "divider",
      }}
    >
      {/* ── Trigger row ─────────────────────────────────────────────────── */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          minHeight: 36,
        }}
      >
        {/* Search field */}
        <TextField
          size="small"
          placeholder="Rechercher un prospect…"
          value={value.search}
          onChange={(e) => onChange({ ...value, search: e.target.value })}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRoundedIcon sx={{ fontSize: 16, color: "text.disabled" }} />
                </InputAdornment>
              ),
              endAdornment: value.search ? (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    onClick={() => onChange({ ...value, search: "" })}
                    aria-label="Effacer la recherche"
                    edge="end"
                    sx={{ p: 0.25 }}
                  >
                    <CloseRoundedIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </InputAdornment>
              ) : null,
            },
          }}
          sx={{
            minWidth: 200,
            maxWidth: 300,
            "& .MuiInputBase-root": { height: 32, fontSize: "0.8125rem", borderRadius: 2 },
            "& .MuiInputBase-input": { py: 0, px: 1 },
          }}
        />

        {/* Toggle button */}
        <Tooltip title={expanded ? "Masquer les filtres" : "Afficher les filtres"}>
          <Badge
            badgeContent={activeCount}
            color="primary"
            invisible={activeCount === 0}
            sx={{ "& .MuiBadge-badge": { fontSize: "0.625rem", minWidth: 16, height: 16 } }}
          >
            <IconButton
              size="small"
              onClick={() => setExpanded((e) => !e)}
              aria-expanded={expanded}
              aria-label="Filtres"
              sx={{
                gap: 0.5,
                px: 1,
                borderRadius: 2,
                border: 1,
                borderColor: isFiltered ? "primary.main" : "divider",
                color: isFiltered ? "primary.main" : "text.secondary",
                bgcolor: isFiltered ? (th) => alpha(th.palette.primary.main, 0.06) : "transparent",
              }}
            >
              <FilterListRoundedIcon sx={{ fontSize: 16 }} />
              <Typography
                component="span"
                sx={{ fontSize: "0.75rem", fontWeight: 600, lineHeight: 1 }}
              >
                Filtres
              </Typography>
              {expanded ? (
                <KeyboardArrowUpRoundedIcon sx={{ fontSize: 14 }} />
              ) : (
                <KeyboardArrowDownRoundedIcon sx={{ fontSize: 14 }} />
              )}
            </IconButton>
          </Badge>
        </Tooltip>

        {/* Active filter summary chips */}
        {!expanded && isFiltered && (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, flex: 1, overflow: "hidden" }}>
            {value.types.map((t) => (
              <Chip
                key={t}
                label={PARTNER_TYPE_LABELS[t]}
                size="small"
                color="primary"
                variant="filled"
                onDelete={() => toggleType(t)}
                sx={{ height: 22, fontSize: "0.625rem", fontWeight: 700, "& .MuiChip-label": { px: 0.75 } }}
              />
            ))}
            {value.stages.map((s) => (
              <Chip
                key={s}
                label={STAGE_LABELS[s]}
                size="small"
                color={STAGE_CHIP_COLORS[s]}
                variant="filled"
                onDelete={() => toggleStage(s)}
                sx={{ height: 22, fontSize: "0.625rem", fontWeight: 700, "& .MuiChip-label": { px: 0.75 } }}
              />
            ))}
            {value.scoreMin !== null && (
              <Chip
                label={`Score ≥ ${value.scoreMin}`}
                size="small"
                color={value.scoreMin === 85 ? "success" : "warning"}
                variant="filled"
                onDelete={() => onChange({ ...value, scoreMin: null })}
                sx={{ height: 22, fontSize: "0.625rem", fontWeight: 700, "& .MuiChip-label": { px: 0.75 } }}
              />
            )}
            {value.marches.map((m) => (
              <Chip
                key={m}
                label={m}
                size="small"
                color="secondary"
                variant="filled"
                onDelete={() => toggleMarche(m)}
                sx={{ height: 22, fontSize: "0.625rem", fontWeight: 700, "& .MuiChip-label": { px: 0.75 } }}
              />
            ))}
          </Box>
        )}

        {/* Spacer */}
        <Box sx={{ flex: 1 }} />

        {/* Result count */}
        <Typography variant="labelSmall" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
          {isFiltered ? (
            <>
              <Typography component="span" variant="labelSmall" sx={{ fontWeight: 800, color: "text.primary" }}>
                {filteredCount}
              </Typography>
              {" / "}
              {totalCount}
            </>
          ) : (
            <>{totalCount} partenaires</>
          )}
        </Typography>

        {/* Clear all */}
        {isFiltered && (
          <Tooltip title="Effacer tous les filtres">
            <IconButton
              size="small"
              onClick={clearAll}
              aria-label="Effacer les filtres"
              sx={{ color: "text.secondary", "&:hover": { color: "error.main" } }}
            >
              <CloseRoundedIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* ── Expanded chip groups ─────────────────────────────────────────── */}
      <Collapse in={expanded} timeout={200}>
        <Box
          sx={{
            pt: 1.5,
            pb: 1,
            display: "flex",
            flexDirection: "column",
            gap: 1.25,
          }}
        >
          {/* Type */}
          <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5 }}>
            <GroupLabel>Type</GroupLabel>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
              {PARTNER_TYPES.map((t) => (
                <FilterChip
                  key={t}
                  label={PARTNER_TYPE_LABELS[t]}
                  active={value.types.includes(t)}
                  onClick={() => toggleType(t)}
                />
              ))}
            </Box>
          </Box>

          <Divider />

          {/* Stage */}
          <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5 }}>
            <GroupLabel>Étape</GroupLabel>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
              {PIPELINE_STAGES.map((s) => (
                <FilterChip
                  key={s}
                  label={STAGE_LABELS[s]}
                  active={value.stages.includes(s)}
                  onClick={() => toggleStage(s)}
                  color={STAGE_CHIP_COLORS[s]}
                />
              ))}
            </Box>
          </Box>

          <Divider />

          {/* Score + Marché on the same row */}
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              gap: { xs: 1.25, md: 3 },
              alignItems: "flex-start",
            }}
          >
            {/* Score */}
            <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5 }}>
              <GroupLabel>Score</GroupLabel>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                {SCORE_OPTIONS.map((opt) => (
                  <FilterChip
                    key={opt.value}
                    label={opt.label}
                    active={value.scoreMin === opt.value}
                    onClick={() => toggleScore(opt.value)}
                    color={opt.color}
                  />
                ))}
              </Box>
            </Box>

            <Divider orientation="vertical" flexItem sx={{ display: { xs: "none", md: "block" } }} />

            {/* Marché */}
            <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5 }}>
              <GroupLabel>Marché</GroupLabel>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                {MARCHES.map((m) => (
                  <FilterChip
                    key={m}
                    label={m}
                    active={value.marches.includes(m)}
                    onClick={() => toggleMarche(m)}
                    color="secondary"
                  />
                ))}
              </Box>
            </Box>
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
}
