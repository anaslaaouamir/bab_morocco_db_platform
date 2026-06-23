"use client";

import React, { useRef } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Tooltip from "@mui/material/Tooltip";
import Badge from "@mui/material/Badge";
import Divider from "@mui/material/Divider";
import { alpha, useTheme } from "@mui/material/styles";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import StarRateRoundedIcon from "@mui/icons-material/StarRateRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";

import type { Prospect, PipelineStage } from "@/types/prospect";
import {
  scoreTotal,
  scoreColor,
  PARTNER_TYPE_LABELS,
  LANGUAGE_FLAGS,
} from "@/types/prospect";

// ─── Column configuration ─────────────────────────────────────────────────

interface KanbanColumn {
  id: string;
  label: string;
  stages: PipelineStage[];
  accent: string;
  targetStage: PipelineStage;
}

const COLUMNS: KanbanColumn[] = [
  { id: "prospection",    label: "Prospection",    stages: ["prospection"],    accent: "#78909C", targetStage: "prospection" },
  { id: "qualification",  label: "Qualification",  stages: ["qualification"],  accent: "#42A5F5", targetStage: "qualification" },
  { id: "outreach",       label: "Outreach",       stages: ["outreach"],       accent: "#FFA726", targetStage: "outreach" },
  { id: "negociation",    label: "Négociation",    stages: ["negociation"],    accent: "#AB47BC", targetStage: "negociation" },
  { id: "closing",        label: "Closing",        stages: ["closing"],        accent: "#66BB6A", targetStage: "closing" },
  { id: "activation_ota", label: "Activation OTA", stages: ["activation_ota"], accent: "#2E7D32", targetStage: "activation_ota" },
  { id: "veille_perdu",   label: "Veille / Perdu", stages: ["veille", "perdu"], accent: "#BDBDBD", targetStage: "veille" },
];

// ─── Props ─────────────────────────────────────────────────────────────────

export interface KanbanBoardProps {
  /** Pre-filtered by FilterBar chips at the page level. */
  prospects: Prospect[];
  /** Called when a card is dragged to a new column. Page holds allProspects state. */
  onStageChange: (id: string, newStage: PipelineStage) => void;
  /** Called when a card body is clicked (not dragged) to open the Fiche Partenaire drawer. */
  onProspectClick?: (prospect: Prospect) => void;
}

// ─── Score badge ──────────────────────────────────────────────────────────

function ScoreBadge({ prospect }: { prospect: Prospect }) {
  const theme = useTheme();
  const total = scoreTotal(prospect.score);
  const color = scoreColor(total);
  const palette = theme.palette[color];
  const isLow = total < 75;

  return (
    <Tooltip
      title={
        isLow
          ? `Score ${total}/100 — sous le seuil outreach (75)`
          : `Score ${total}/100 — qualifié pour outreach`
      }
      placement="top"
    >
      <Box
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: 0.25,
          px: 0.75,
          py: 0.125,
          borderRadius: 1,
          bgcolor: alpha(palette.main, 0.12),
          border: `1px solid ${alpha(palette.main, 0.25)}`,
          cursor: "default",
        }}
      >
        {isLow ? (
          <WarningAmberRoundedIcon sx={{ fontSize: 11, color: palette.main }} />
        ) : (
          <StarRateRoundedIcon sx={{ fontSize: 11, color: palette.main }} />
        )}
        <Typography
          component="span"
          sx={{ fontSize: "0.6875rem", fontWeight: 700, lineHeight: 1, color: palette.main }}
        >
          {total}
        </Typography>
      </Box>
    </Tooltip>
  );
}

// ─── Kanban card ──────────────────────────────────────────────────────────

function KanbanCard({
  prospect,
  index,
  onClick,
}: {
  prospect: Prospect;
  index: number;
  onClick?: (p: Prospect) => void;
}) {
  const theme = useTheme();
  // Distinguish click from drag: record pointer-down position; suppress onClick if moved > 4px
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);
  const didDrag = useRef(false);

  return (
    <Draggable draggableId={prospect.id} index={index}>
      {(provided, snapshot) => (
        <Card
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          elevation={snapshot.isDragging ? 8 : 1}
          onPointerDown={(e) => {
            pointerDownPos.current = { x: e.clientX, y: e.clientY };
            didDrag.current = false;
          }}
          onPointerMove={(e) => {
            if (pointerDownPos.current) {
              const dx = Math.abs(e.clientX - pointerDownPos.current.x);
              const dy = Math.abs(e.clientY - pointerDownPos.current.y);
              if (dx > 4 || dy > 4) didDrag.current = true;
            }
          }}
          onClick={() => {
            if (!didDrag.current) onClick?.(prospect);
          }}
          sx={{
            mb: 1.25,
            borderRadius: 2,
            cursor: snapshot.isDragging ? "grabbing" : "grab",
            userSelect: "none",
            opacity: snapshot.isDragging ? 0.96 : 1,
            rotate: snapshot.isDragging ? "1.5deg" : "0deg",
            scale: snapshot.isDragging ? "1.02" : "1",
            transition: snapshot.isDragging
              ? "none"
              : "box-shadow 200ms ease, rotate 200ms ease, scale 200ms ease",
            "&:hover": { boxShadow: theme.shadows[3] },
          }}
        >
          <CardContent sx={{ p: "10px 12px !important" }}>
            {/* Name row */}
            <Box sx={{ display: "flex", alignItems: "flex-start", gap: 0.5, mb: 0.75 }}>
              <DragIndicatorIcon
                sx={{ fontSize: 14, color: "text.disabled", mt: "2px", flexShrink: 0 }}
              />
              <Typography
                variant="bodySmall"
                sx={{
                  fontWeight: 700,
                  flex: 1,
                  lineHeight: 1.3,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {prospect.nom}
              </Typography>
            </Box>

            {/* Type chip + language flag */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 1 }}>
              <Chip
                label={PARTNER_TYPE_LABELS[prospect.type]}
                size="small"
                sx={{
                  height: 18,
                  fontSize: "0.625rem",
                  fontWeight: 600,
                  "& .MuiChip-label": { px: 0.75 },
                }}
              />
              <Typography component="span" sx={{ fontSize: "0.875rem", lineHeight: 1 }}>
                {LANGUAGE_FLAGS[prospect.langue]}
              </Typography>
            </Box>

            {/* Location */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.375, mb: 1 }}>
              <PlaceOutlinedIcon sx={{ fontSize: 12, color: "text.secondary", flexShrink: 0 }} />
              <Typography variant="bodySmall" color="text.secondary" noWrap>
                {prospect.ville}, {prospect.pays}
              </Typography>
            </Box>

            <Divider sx={{ my: 0.75 }} />

            {/* Footer: score + commission */}
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <ScoreBadge prospect={prospect} />
              <Typography variant="labelSmall" sx={{ fontWeight: 700, color: "text.secondary" }}>
                {prospect.commissionStandard}%{" "}
                <Typography component="span" variant="labelSmall" color="text.disabled">
                  comm.
                </Typography>
              </Typography>
            </Box>

            {/* Human-escalation flag */}
            {prospect.notes?.includes("VALIDATION HUMAINE REQUISE") && (
              <Box
                sx={{
                  mt: 0.75,
                  px: 0.75,
                  py: 0.375,
                  borderRadius: 1,
                  bgcolor: alpha(theme.palette.error.main, 0.08),
                  border: `1px solid ${alpha(theme.palette.error.main, 0.2)}`,
                }}
              >
                <Typography
                  variant="labelSmall"
                  sx={{ color: "error.main", fontWeight: 700, fontSize: "0.5938rem" }}
                >
                  ⚠ VALIDATION HUMAINE REQUISE
                </Typography>
              </Box>
            )}
          </CardContent>
        </Card>
      )}
    </Draggable>
  );
}

// ─── Kanban column ────────────────────────────────────────────────────────

function KanbanColumnComponent({
  column,
  prospects,
  onProspectClick,
}: {
  column: KanbanColumn;
  prospects: Prospect[];
  onProspectClick?: (p: Prospect) => void;
}) {
  const theme = useTheme();

  return (
    <Box sx={{ width: 252, flexShrink: 0, display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.25, px: 0.5 }}>
        <Box
          sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: column.accent, flexShrink: 0 }}
        />
        <Typography
          variant="titleSmall"
          sx={{ flex: 1, fontWeight: 700, color: "text.primary" }}
          noWrap
        >
          {column.label}
        </Typography>
        <Badge
          badgeContent={prospects.length}
          showZero
          sx={{
            "& .MuiBadge-badge": {
              position: "static",
              transform: "none",
              bgcolor: alpha(column.accent, 0.18),
              color: column.accent === "#BDBDBD" ? "text.secondary" : column.accent,
              fontWeight: 700,
              fontSize: "0.6875rem",
              minWidth: 20,
              height: 20,
              borderRadius: 10,
              px: 0.5,
            },
          }}
        />
      </Box>

      {/* Droppable */}
      <Droppable droppableId={column.id}>
        {(provided, snapshot) => (
          <Box
            ref={provided.innerRef}
            {...provided.droppableProps}
            sx={{
              flex: 1,
              minHeight: 120,
              borderRadius: 2,
              p: 1,
              bgcolor: snapshot.isDraggingOver
                ? alpha(column.accent, 0.08)
                : alpha(theme.palette.action.hover, 0.5),
              border: snapshot.isDraggingOver
                ? `2px dashed ${alpha(column.accent, 0.5)}`
                : "2px dashed transparent",
              transition: "background-color 150ms ease, border-color 150ms ease",
            }}
          >
            {prospects.map((p, i) => (
              <KanbanCard key={p.id} prospect={p} index={i} onClick={onProspectClick} />
            ))}
            {provided.placeholder}

            {prospects.length === 0 && !snapshot.isDraggingOver && (
              <Box
                sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: 80 }}
              >
                <Typography variant="bodySmall" color="text.disabled">
                  Aucun prospect
                </Typography>
              </Box>
            )}
          </Box>
        )}
      </Droppable>
    </Box>
  );
}

// ─── Board root ────────────────────────────────────────────────────────────

export default function KanbanBoard({ prospects, onStageChange, onProspectClick }: KanbanBoardProps) {
  function handleDragEnd(result: DropResult) {
    if (!result.destination) return;
    const col = COLUMNS.find((c) => c.id === result.destination!.droppableId);
    if (!col) return;
    onStageChange(result.draggableId, col.targetStage);
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <Box
        sx={{
          display: "flex",
          flexDirection: "row",
          gap: 2,
          overflowX: "auto",
          alignItems: "flex-start",
          px: { xs: 2, md: 4 },
          py: 2,
          minHeight: "calc(100vh - 220px)",
          "&::-webkit-scrollbar": { height: 6 },
          "&::-webkit-scrollbar-track": { bgcolor: "transparent" },
          "&::-webkit-scrollbar-thumb": { bgcolor: "divider", borderRadius: 3 },
        }}
      >
        {COLUMNS.map((col) => (
          <KanbanColumnComponent
            key={col.id}
            column={col}
            prospects={prospects.filter((p) => col.stages.includes(p.stage))}
            onProspectClick={onProspectClick}
          />
        ))}
      </Box>
    </DragDropContext>
  );
}
