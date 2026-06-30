import Link from "next/link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import HomeRoundedIcon from "@mui/icons-material/HomeRounded";
import SearchOffRoundedIcon from "@mui/icons-material/SearchOffRounded";

/**
 * MD3-styled 404 page — rendered inside app/layout.tsx so it inherits
 * the ThemeRegistry and Roboto font. Lives outside the (app) route group,
 * so it does not include the AppShell navigation rail/bar.
 */
export default function NotFound() {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "70vh",
        gap: 2.5,
        px: 3,
        textAlign: "center",
      }}
    >
      {/* Monogram icon */}
      <Box
        sx={{
          width: 72,
          height: 72,
          borderRadius: "50%",
          bgcolor: "primary.main",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          mb: 1,
        }}
      >
        <SearchOffRoundedIcon sx={{ color: "primary.contrastText", fontSize: 36 }} />
      </Box>

      {/* Large "404" display */}
      <Typography
        variant="displaySmall"
        sx={{ fontWeight: 300, color: "text.disabled", lineHeight: 1 }}
      >
        404
      </Typography>

      <Box sx={{ maxWidth: 380 }}>
        <Typography variant="headlineSmall" sx={{ mb: 1 }}>
          Page introuvable
        </Typography>
        <Typography variant="bodyMedium" color="text.secondary">
          La page que vous recherchez n&apos;existe pas ou a été déplacée.
          Revenez au tableau de bord pour naviguer dans la plateforme.
        </Typography>
      </Box>

      <Button
        component={Link as React.ElementType}
        href="/"
        variant="contained"
        color="primary"
        startIcon={<HomeRoundedIcon />}
        disableElevation
        sx={{ mt: 1 }}
      >
        Retour au Dashboard
      </Button>
    </Box>
  );
}
