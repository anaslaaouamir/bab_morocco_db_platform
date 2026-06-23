import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";

export default function DashboardPage() {
  return (
    <Box sx={{ p: { xs: 2, sm: 3, md: 4 } }}>
      <Typography variant="headlineMedium" component="h1" sx={{ mb: 0.5 }}>
        Dashboard
      </Typography>
      <Typography variant="bodyMedium" color="text.secondary" sx={{ mb: 3 }}>
        Vue d&apos;ensemble du pipeline partenaires — Bab Morocco BD Platform
      </Typography>

      <Card elevation={1} sx={{ maxWidth: 520 }}>
        <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2, p: 3 }}>
          <Typography variant="titleLarge">Phase 1 en cours</Typography>
          <Typography variant="bodyMedium" color="text.secondary">
            Prospection, scoring et gestion du pipeline partenaires B2B.
            Objectif : 500 prospects qualifiés avant le lancement de l&apos;OTA.
          </Typography>
          <Button variant="contained" color="primary" sx={{ alignSelf: "flex-start" }}>
            Voir les prospects
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}
