import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";

/**
 * Global route-level loading fallback (Next.js App Router).
 * Shown while the root page shell is streaming.
 */
export default function GlobalLoading() {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        gap: 2,
      }}
    >
      <CircularProgress color="primary" size={40} thickness={4} />
      <Typography variant="bodyMedium" color="text.secondary">
        Chargement…
      </Typography>
    </Box>
  );
}
