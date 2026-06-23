import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

export default function OutreachPage() {
  return (
    <Box sx={{ p: { xs: 2, sm: 3, md: 4 } }}>
      <Typography variant="headlineMedium" component="h1" sx={{ mb: 0.5 }}>
        Outreach
      </Typography>
      <Typography variant="bodyMedium" color="text.secondary">
        Séquences d&apos;emails personnalisés, suivi d&apos;ouverture et relances automatiques.
      </Typography>
    </Box>
  );
}
