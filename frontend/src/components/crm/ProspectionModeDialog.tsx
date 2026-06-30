"use client";

import React from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import { alpha, useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import EditNoteRoundedIcon from "@mui/icons-material/EditNoteRounded";
import TravelExploreRoundedIcon from "@mui/icons-material/TravelExploreRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";

import { useAuth } from "@/contexts/AuthContext";

export type ProspectionMode = "manuel" | "scan";

interface ProspectionModeDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (mode: ProspectionMode) => void;
}

const MODES = [
  {
    id: "manuel" as ProspectionMode,
    icon: <EditNoteRoundedIcon sx={{ fontSize: 32 }} />,
    title: "Ajout manuel",
    subtitle: "Saisir un prospect manuellement",
    description:
      "Renseignez vous-même toutes les informations : nom, contact, scoring, commission. Idéal pour un partenaire identifié lors d'un salon, d'une recommandation, ou d'une recherche personnelle.",
    badge: null,
    color: "primary" as const,
  },
  {
    id: "scan" as ProspectionMode,
    icon: <TravelExploreRoundedIcon sx={{ fontSize: 32 }} />,
    title: "Scan automatique",
    subtitle: "Alimenté par Google Maps",
    description:
      "Définissez une ville, un pays et un type de partenaire. L'agent scanne Google Maps, enrichit chaque prospect (OTAs, contact, site web) et calcule le scoring automatiquement.",
    badge: "IA",
    color: "secondary" as const,
  },
];

export default function ProspectionModeDialog({
  open,
  onClose,
  onSelect,
}: ProspectionModeDialogProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { isCommercial } = useAuth();
  const modes = isCommercial ? MODES.filter((m) => m.id === "manuel") : MODES;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      fullScreen={isMobile}
      PaperProps={{ sx: { borderRadius: isMobile ? 0 : 3 } }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          px: 3,
          py: 2,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Box sx={{ flex: 1 }}>
          <Typography variant="titleLarge" sx={{ fontWeight: 700 }}>
            Nouvelle prospection
          </Typography>
          <Typography variant="bodySmall" color="text.secondary">
            Choisissez comment ajouter des prospects au pipeline.
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseRoundedIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ px: 3, py: 3, display: "flex", flexDirection: "column", gap: 2 }}>
        {modes.map((mode) => {
          const palette = theme.palette[mode.color];
          return (
            <Card
              key={mode.id}
              elevation={0}
              variant="outlined"
              sx={{
                borderRadius: 2.5,
                borderColor: alpha(palette.main, 0.35),
                transition: "border-color 150ms, box-shadow 150ms",
                "&:hover": {
                  borderColor: palette.main,
                  boxShadow: `0 0 0 1px ${alpha(palette.main, 0.4)}`,
                },
              }}
            >
              <CardActionArea
                onClick={() => onSelect(mode.id)}
                sx={{ borderRadius: 2.5, p: 0 }}
              >
                <CardContent sx={{ p: "20px 20px !important" }}>
                  <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start" }}>
                    <Box
                      sx={{
                        width: 52,
                        height: 52,
                        borderRadius: 2,
                        bgcolor: alpha(palette.main, 0.1),
                        color: palette.main,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {mode.icon}
                    </Box>

                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                        <Typography variant="titleMedium" sx={{ fontWeight: 700 }}>
                          {mode.title}
                        </Typography>
                        {mode.badge && (
                          <Chip
                            label={mode.badge}
                            size="small"
                            color={mode.color}
                            sx={{ height: 18, fontSize: "0.625rem", fontWeight: 800, "& .MuiChip-label": { px: 0.75 } }}
                          />
                        )}
                      </Box>
                      <Typography variant="bodySmall" color={`${mode.color}.main`} sx={{ fontWeight: 600, display: "block", mb: 0.5 }}>
                        {mode.subtitle}
                      </Typography>
                      <Typography variant="bodySmall" color="text.secondary">
                        {mode.description}
                      </Typography>
                    </Box>

                    <ArrowForwardRoundedIcon sx={{ color: "text.disabled", flexShrink: 0, mt: 0.5 }} />
                  </Box>
                </CardContent>
              </CardActionArea>
            </Card>
          );
        })}
      </DialogContent>
    </Dialog>
  );
}
