import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";

export default function Home() {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
        p: 4,
        bgcolor: "background.default",
      }}
    >
      <Typography variant="headlineLarge" component="h1" color="primary">
        Bab Morocco
      </Typography>
      <Typography variant="titleMedium" color="text.secondary">
        BD Intelligence Platform — Phase 1
      </Typography>

      <Card sx={{ maxWidth: 480, width: "100%" }} elevation={1}>
        <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2, p: 3 }}>
          <Typography variant="titleLarge">Bienvenue</Typography>
          <Typography variant="bodyMedium" color="text.secondary">
            Plateforme interne de prospection, scoring et gestion du pipeline
            partenaires B2B pour le lancement de l'OTA Bab Morocco.
          </Typography>
          <Button variant="contained" color="primary" sx={{ alignSelf: "flex-start" }}>
            Accéder au CRM
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}
