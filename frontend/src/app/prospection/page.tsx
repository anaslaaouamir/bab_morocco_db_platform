import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

export default function ProspectionPage() {
  return (
    <Box sx={{ p: { xs: 2, sm: 3, md: 4 } }}>
      <Typography variant="headlineMedium" component="h1" sx={{ mb: 0.5 }}>
        Prospection
      </Typography>
      <Typography variant="bodyMedium" color="text.secondary">
        Scan, enrichissement et scoring automatique des prospects partenaires.
      </Typography>
    </Box>
  );
}
