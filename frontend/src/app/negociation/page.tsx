import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

export default function NegociationPage() {
  return (
    <Box sx={{ p: { xs: 2, sm: 3, md: 4 } }}>
      <Typography variant="headlineMedium" component="h1" sx={{ mb: 0.5 }}>
        Négociation
      </Typography>
      <Typography variant="bodyMedium" color="text.secondary">
        Analyse sémantique des réponses, scénarios de contre-offre et escalade humaine.
      </Typography>
    </Box>
  );
}
