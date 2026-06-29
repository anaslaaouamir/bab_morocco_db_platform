"use client";

import React, { useState, useMemo } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import ToggleButton from "@mui/material/ToggleButton";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import CircularProgress from "@mui/material/CircularProgress";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import TableChartOutlinedIcon from "@mui/icons-material/TableChartOutlined";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";

import type { Prospect, PartnerType, PipelineStage } from "@/types/prospect";
import {
  PARTNER_TYPE_LABELS,
  STAGE_LABELS,
  scoreTotal,
} from "@/types/prospect";
import type { FilterState } from "@/lib/filters";
import { applyFilters, EMPTY_FILTERS } from "@/lib/filters";
import { toggleItem } from "@/lib/filters";

// ─── Types ─────────────────────────────────────────────────────────────────

type ExportFormat = "excel" | "pdf";

interface Props {
  open: boolean;
  onClose: () => void;
  allProspects: Prospect[];
  /** Pre-fill filters from the current page state */
  initialFilters?: FilterState;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const ALL_TYPES: PartnerType[] = [
  "hotel_riad", "hotel_luxe", "tour_operateur", "agence_voyage",
  "prestataire_activites", "transport", "to_golfe", "mice",
];

const ALL_STAGES: PipelineStage[] = [
  "prospection", "qualification", "outreach",
  "negociation", "closing", "activation_ota", "veille", "perdu",
];

const ALL_MARCHES = ["Maroc", "France", "EAU", "Golfe"];

const SCORE_OPTIONS: { label: string; value: FilterState["scoreMin"] }[] = [
  { label: "Tous", value: null },
  { label: "≥ 75", value: 75 },
  { label: "≥ 85", value: 85 },
];

// ─── Export helpers ────────────────────────────────────────────────────────

function toRows(prospects: Prospect[]) {
  return prospects.map((p) => ({
    Nom: p.nom,
    "Type de partenaire": PARTNER_TYPE_LABELS[p.type],
    Ville: p.ville,
    Pays: p.pays,
    Email: p.emailContact,
    Contact: p.nomContact,
    "Étape pipeline": STAGE_LABELS[p.stage],
    "Commission (%)": p.commissionStandard,
    "Score /100": scoreTotal(p.score),
    Langue: p.langue.toUpperCase(),
    "Date d'ajout": p.dateAjout,
  }));
}

async function exportExcel(rows: ReturnType<typeof toRows>, filename: string) {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Prospects");
  // Auto column widths
  const colWidths = Object.keys(rows[0] ?? {}).map((key) => ({
    wch: Math.max(key.length, ...rows.map((r) => String((r as Record<string, unknown>)[key] ?? "").length)) + 2,
  }));
  ws["!cols"] = colWidths;
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

async function exportPdf(rows: ReturnType<typeof toRows>, filename: string, count: number) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  doc.setFontSize(14);
  doc.text("Bab Morocco — BD Intelligence Platform", 14, 14);
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(`Export prospects — ${count} résultat(s) — ${new Date().toLocaleDateString("fr-FR")}`, 14, 21);

  if (rows.length === 0) {
    doc.setFontSize(11);
    doc.setTextColor(80);
    doc.text("Aucun prospect ne correspond aux filtres sélectionnés.", 14, 35);
  } else {
    const head = [Object.keys(rows[0])];
    const body = rows.map((r) => Object.values(r).map(String));
    autoTable(doc, {
      head,
      body,
      startY: 28,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [103, 80, 164], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 245, 250] },
      margin: { left: 14, right: 14 },
    });
  }

  doc.save(`${filename}.pdf`);
}

// ─── Component ─────────────────────────────────────────────────────────────

export default function ExportDialog({ open, onClose, allProspects, initialFilters }: Props) {
  const [format, setFormat]     = useState<ExportFormat>("excel");
  const [filters, setFilters]   = useState<FilterState>(initialFilters ?? EMPTY_FILTERS);
  const [loading, setLoading]   = useState(false);

  // Reset when dialog opens
  React.useEffect(() => {
    if (open) {
      setFilters(initialFilters ?? EMPTY_FILTERS);
      setFormat("excel");
      setLoading(false);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredProspects = useMemo(
    () => applyFilters(allProspects, filters),
    [allProspects, filters],
  );

  const filename = `bab_morocco_prospects_${new Date().toISOString().slice(0, 10)}`;

  async function handleExport() {
    setLoading(true);
    try {
      const rows = toRows(filteredProspects);
      if (format === "excel") {
        await exportExcel(rows, filename);
      } else {
        await exportPdf(rows, filename, filteredProspects.length);
      }
      onClose();
    } finally {
      setLoading(false);
    }
  }

  // ── Filter togglers ──────────────────────────────────────────────────────

  function toggleType(t: PartnerType) {
    setFilters((f) => ({ ...f, types: toggleItem(f.types, t) }));
  }
  function toggleStage(s: PipelineStage) {
    setFilters((f) => ({ ...f, stages: toggleItem(f.stages, s) }));
  }
  function toggleMarche(m: string) {
    setFilters((f) => ({ ...f, marches: toggleItem(f.marches, m) }));
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <FileDownloadOutlinedIcon />
          <Typography variant="titleLarge" component="span">
            Exporter les prospects
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent dividers sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>

        {/* Format selector */}
        <Box>
          <Typography variant="labelMedium" color="text.secondary" sx={{ mb: 1, display: "block" }}>
            FORMAT
          </Typography>
          <ToggleButtonGroup
            value={format}
            exclusive
            onChange={(_, v) => v && setFormat(v as ExportFormat)}
            size="small"
          >
            <ToggleButton value="excel" sx={{ gap: 0.75, textTransform: "none", px: 2 }}>
              <TableChartOutlinedIcon fontSize="small" />
              Excel (.xlsx)
            </ToggleButton>
            <ToggleButton value="pdf" sx={{ gap: 0.75, textTransform: "none", px: 2 }}>
              <PictureAsPdfOutlinedIcon fontSize="small" />
              PDF
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>

        <Divider />

        {/* Filters */}
        <Box>
          <Typography variant="labelMedium" color="text.secondary" sx={{ mb: 1.5, display: "block" }}>
            FILTRES (laisser vide = tout exporter)
          </Typography>

          {/* Types */}
          <Typography variant="labelSmall" color="text.secondary" sx={{ mb: 0.75, display: "block" }}>
            Type de partenaire
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mb: 2 }}>
            {ALL_TYPES.map((t) => (
              <Chip
                key={t}
                label={PARTNER_TYPE_LABELS[t]}
                size="small"
                onClick={() => toggleType(t)}
                color={filters.types.includes(t) ? "primary" : "default"}
                variant={filters.types.includes(t) ? "filled" : "outlined"}
                sx={{ cursor: "pointer" }}
              />
            ))}
          </Box>

          {/* Stages */}
          <Typography variant="labelSmall" color="text.secondary" sx={{ mb: 0.75, display: "block" }}>
            Étape pipeline
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mb: 2 }}>
            {ALL_STAGES.map((s) => (
              <Chip
                key={s}
                label={STAGE_LABELS[s]}
                size="small"
                onClick={() => toggleStage(s)}
                color={filters.stages.includes(s) ? "primary" : "default"}
                variant={filters.stages.includes(s) ? "filled" : "outlined"}
                sx={{ cursor: "pointer" }}
              />
            ))}
          </Box>

          {/* Marchés */}
          <Typography variant="labelSmall" color="text.secondary" sx={{ mb: 0.75, display: "block" }}>
            Marché
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mb: 2 }}>
            {ALL_MARCHES.map((m) => (
              <Chip
                key={m}
                label={m}
                size="small"
                onClick={() => toggleMarche(m)}
                color={filters.marches.includes(m) ? "primary" : "default"}
                variant={filters.marches.includes(m) ? "filled" : "outlined"}
                sx={{ cursor: "pointer" }}
              />
            ))}
          </Box>

          {/* Score minimum */}
          <Typography variant="labelSmall" color="text.secondary" sx={{ mb: 0.75, display: "block" }}>
            Score minimum
          </Typography>
          <Box sx={{ display: "flex", gap: 0.75 }}>
            {SCORE_OPTIONS.map((opt) => (
              <Chip
                key={String(opt.value)}
                label={opt.label}
                size="small"
                onClick={() => setFilters((f) => ({ ...f, scoreMin: opt.value }))}
                color={filters.scoreMin === opt.value ? "primary" : "default"}
                variant={filters.scoreMin === opt.value ? "filled" : "outlined"}
                sx={{ cursor: "pointer" }}
              />
            ))}
          </Box>
        </Box>

        <Divider />

        {/* Preview count */}
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Typography variant="bodyMedium" color="text.secondary">
            Prospects inclus dans l&apos;export
          </Typography>
          <Chip
            label={`${filteredProspects.length} / ${allProspects.length}`}
            color={filteredProspects.length > 0 ? "success" : "default"}
            variant="outlined"
            size="small"
          />
        </Box>

      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
        <Button onClick={onClose} disabled={loading}>
          Annuler
        </Button>
        <Button
          variant="contained"
          onClick={handleExport}
          disabled={loading || filteredProspects.length === 0}
          startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <FileDownloadOutlinedIcon />}
        >
          {loading ? "Export en cours…" : `Exporter ${filteredProspects.length} prospect(s)`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
