"use client";

import React, { useState, useMemo, useCallback } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Button from "@mui/material/Button";
import Fab from "@mui/material/Fab";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import TableChartOutlinedIcon from "@mui/icons-material/TableChartOutlined";
import ViewKanbanOutlinedIcon from "@mui/icons-material/ViewKanbanOutlined";

import mockProspects from "@/data/mockProspects";
import type { Prospect, PipelineStage } from "@/types/prospect";
import { scoreTotal, STAGE_LABELS } from "@/types/prospect";
import { EMPTY_FILTERS, applyFilters, type FilterState } from "@/lib/filters";
import { useSnackbar } from "@/contexts/SnackbarContext";
import FilterBar from "@/components/shared/FilterBar";
import ProspectTable from "@/components/crm/ProspectTable";
import KanbanBoard from "@/components/kanban/KanbanBoard";
import ProspectDrawer from "@/components/crm/ProspectDrawer";
import AddProspectDialog from "@/components/crm/AddProspectDialog";

// ─── Page ─────────────────────────────────────────────────────────────────

export default function ProspectionPage() {
  const { showSnackbar } = useSnackbar();

  // Source-of-truth for all prospects
  const [allProspects, setAllProspects] = useState<Prospect[]>(mockProspects);

  // Filter chips state
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);

  // Tab: 0 = CRM Table, 1 = Kanban
  const [tab, setTab] = useState(0);

  // Fiche Partenaire drawer
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Add Prospect dialog
  const [dialogOpen, setDialogOpen] = useState(false);

  // Filtered subset
  const filteredProspects = useMemo(
    () => applyFilters(allProspects, filters),
    [allProspects, filters]
  );

  // Keep drawer reference live so chips update after a stage change
  const liveSelectedProspect = useMemo(
    () =>
      selectedProspect
        ? (allProspects.find((p) => p.id === selectedProspect.id) ?? null)
        : null,
    [allProspects, selectedProspect]
  );

  // KPI chips — reflect filtered list
  const kpiStats = useMemo(() => {
    const total       = filteredProspects.length;
    const qualifies   = filteredProspects.filter((p) => scoreTotal(p.score) >= 75).length;
    const negociation = filteredProspects.filter((p) => p.stage === "negociation").length;
    const signes      = filteredProspects.filter((p) => p.stage === "activation_ota").length;
    return [
      { label: "Prospects",      value: total,       color: "default"   as const },
      { label: "Qualifiés ≥75",  value: qualifies,   color: "info"      as const },
      { label: "En négociation", value: negociation, color: "secondary" as const },
      { label: "Signés",         value: signes,      color: "success"   as const },
    ];
  }, [filteredProspects]);

  // ── Handlers ────────────────────────────────────────────────

  const handleProspectClick = useCallback((prospect: Prospect) => {
    setSelectedProspect(prospect);
    setDrawerOpen(true);
  }, []);

  const handleDrawerClose = useCallback(() => setDrawerOpen(false), []);

  const handleStageChange = useCallback(
    (id: string, newStage: PipelineStage) => {
      const previous = allProspects.find((p) => p.id === id);
      if (!previous || previous.stage === newStage) return;

      setAllProspects((prev) =>
        prev.map((p) => (p.id === id ? { ...p, stage: newStage } : p))
      );

      showSnackbar({
        message: `${previous.nom} → ${STAGE_LABELS[newStage]}`,
        severity: "success",
        duration: 5000,
        action: (
          <Button
            color="inherit"
            size="small"
            onClick={() =>
              setAllProspects((prev) =>
                prev.map((p) => (p.id === id ? { ...p, stage: previous.stage } : p))
              )
            }
          >
            Annuler
          </Button>
        ),
      });
    },
    [allProspects, showSnackbar]
  );

  const handleNotesChange = useCallback(
    (id: string, notes: string) => {
      setAllProspects((prev) =>
        prev.map((p) => (p.id === id ? { ...p, notes } : p))
      );
      showSnackbar({ message: "Note enregistrée", severity: "info", duration: 2500 });
    },
    [showSnackbar]
  );

  const handleAddProspect = useCallback(
    (prospect: Prospect) => {
      setAllProspects((prev) => [prospect, ...prev]);
      showSnackbar({
        message: `${prospect.nom} ajouté au pipeline`,
        severity: "success",
        duration: 4000,
        action: (
          <Button
            color="inherit"
            size="small"
            onClick={() => {
              setSelectedProspect(prospect);
              setDrawerOpen(true);
            }}
          >
            Voir
          </Button>
        ),
      });
    },
    [showSnackbar]
  );

  // ── Render ───────────────────────────────────────────────────

  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100%", position: "relative" }}>

      {/* Page header */}
      <Box sx={{ px: { xs: 2, sm: 3, md: 4 }, pt: { xs: 2, md: 3 }, pb: 0 }}>
        <Typography variant="headlineMedium" component="h1" sx={{ mb: 0.5 }}>
          Prospection
        </Typography>
        <Typography variant="bodyMedium" color="text.secondary" sx={{ mb: 2 }}>
          Pipeline partenaires B2B — Bab Morocco BD Intelligence Platform
        </Typography>

        {/* KPI chips */}
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 2 }}>
          {kpiStats.map((s) => (
            <Chip
              key={s.label}
              label={
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <Typography
                    component="span"
                    sx={{ fontWeight: 800, fontSize: "0.875rem", lineHeight: 1 }}
                  >
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

        {/* Tab switcher */}
        <Tabs
          value={tab}
          onChange={(_, v: number) => setTab(v)}
          aria-label="Vue des prospects"
          sx={{ minHeight: 40 }}
          TabIndicatorProps={{ style: { height: 3, borderRadius: "3px 3px 0 0" } }}
        >
          <Tab
            icon={<TableChartOutlinedIcon fontSize="small" />}
            iconPosition="start"
            label="CRM Table"
            id="tab-crm"
            aria-controls="panel-crm"
            sx={{ minHeight: 40, textTransform: "none", fontWeight: 600, fontSize: "0.875rem" }}
          />
          <Tab
            icon={<ViewKanbanOutlinedIcon fontSize="small" />}
            iconPosition="start"
            label="Pipeline Kanban"
            id="tab-kanban"
            aria-controls="panel-kanban"
            sx={{ minHeight: 40, textTransform: "none", fontWeight: 600, fontSize: "0.875rem" }}
          />
        </Tabs>
      </Box>

      {/* Filter bar */}
      <FilterBar
        value={filters}
        onChange={setFilters}
        totalCount={allProspects.length}
        filteredCount={filteredProspects.length}
      />

      <Divider />

      {/* CRM Table panel */}
      <Box
        role="tabpanel"
        id="panel-crm"
        aria-labelledby="tab-crm"
        hidden={tab !== 0}
        sx={{ pt: 2, flex: 1 }}
      >
        {tab === 0 && (
          <ProspectTable
            prospects={filteredProspects}
            onProspectClick={handleProspectClick}
          />
        )}
      </Box>

      {/* Kanban panel */}
      <Box
        role="tabpanel"
        id="panel-kanban"
        aria-labelledby="tab-kanban"
        hidden={tab !== 1}
        sx={{ flex: 1, overflow: "hidden" }}
      >
        {tab === 1 && (
          <KanbanBoard
            prospects={filteredProspects}
            onStageChange={handleStageChange}
            onProspectClick={handleProspectClick}
          />
        )}
      </Box>

      {/* Extended FAB — Ajouter un prospect */}
      <Fab
        variant="extended"
        color="primary"
        onClick={() => setDialogOpen(true)}
        aria-label="Ajouter un prospect"
        sx={{
          position: "fixed",
          right: { xs: 16, md: 24 },
          bottom: {
            xs: "calc(80px + env(safe-area-inset-bottom, 0px) + 16px)",
            md: 24,
          },
          zIndex: (t) => t.zIndex.speedDial,
          gap: 1,
          pl: 2,
          pr: 2.5,
          boxShadow: 3,
          textTransform: "none",
          fontWeight: 700,
          fontSize: "0.9375rem",
          height: 56,
          borderRadius: "16px",
        }}
      >
        <AddRoundedIcon />
        Ajouter un prospect
      </Fab>

      {/* Add Prospect dialog */}
      <AddProspectDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onAdd={handleAddProspect}
      />

      {/* Fiche Partenaire drawer */}
      <ProspectDrawer
        prospect={liveSelectedProspect}
        open={drawerOpen}
        onClose={handleDrawerClose}
        onStageChange={handleStageChange}
        onNotesChange={handleNotesChange}
      />
    </Box>
  );
}
