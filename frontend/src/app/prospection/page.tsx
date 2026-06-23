"use client";

import React, { useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import TableChartOutlinedIcon from "@mui/icons-material/TableChartOutlined";
import ViewKanbanOutlinedIcon from "@mui/icons-material/ViewKanbanOutlined";

import mockProspects from "@/data/mockProspects";
import { scoreTotal } from "@/types/prospect";
import ProspectTable from "@/components/crm/ProspectTable";
import KanbanBoard from "@/components/kanban/KanbanBoard";

// ─── Computed stats from mock data ────────────────────────────────────────

const total = mockProspects.length;
const qualifies = mockProspects.filter((p) => scoreTotal(p.score) >= 75).length;
const enNegociation = mockProspects.filter((p) => p.stage === "negociation").length;
const signes = mockProspects.filter((p) => p.stage === "activation_ota").length;

const STATS = [
  { label: "Prospects", value: total, color: "default" as const },
  { label: "Qualifiés ≥75", value: qualifies, color: "info" as const },
  { label: "En négociation", value: enNegociation, color: "secondary" as const },
  { label: "Signés", value: signes, color: "success" as const },
];

// ─── Page ─────────────────────────────────────────────────────────────────

export default function ProspectionPage() {
  const [tab, setTab] = useState(0);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>

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
          {STATS.map((s) => (
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
                  <Typography
                    component="span"
                    sx={{ fontSize: "0.75rem", opacity: 0.85 }}
                  >
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

      <Divider />

      {/* Tab panels */}
      <Box
        role="tabpanel"
        id="panel-crm"
        aria-labelledby="tab-crm"
        hidden={tab !== 0}
        sx={{ pt: 2, flex: 1 }}
      >
        {tab === 0 && <ProspectTable />}
      </Box>

      <Box
        role="tabpanel"
        id="panel-kanban"
        aria-labelledby="tab-kanban"
        hidden={tab !== 1}
        sx={{ flex: 1, overflow: "hidden" }}
      >
        {tab === 1 && <KanbanBoard />}
      </Box>
    </Box>
  );
}
