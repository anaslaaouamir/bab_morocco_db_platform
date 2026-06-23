import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

export default function ContratsPage() {
  return (
    <Box sx={{ p: { xs: 2, sm: 3, md: 4 } }}>
      <Typography variant="headlineMedium" component="h1" sx={{ mb: 0.5 }}>
        Contrats
      </Typography>
      <Typography variant="bodyMedium" color="text.secondary">
        Génération de contrats PDF, signature électronique YouSign et activation OTA automatique.
      </Typography>
    </Box>
  );
}
