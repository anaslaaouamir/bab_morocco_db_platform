import Box from "@mui/material/Box";
import Skeleton from "@mui/material/Skeleton";

/**
 * Prospection-route loading skeleton — mimics the page layout:
 * header → tabs → filter bar → table rows.
 */
export default function ProspectionLoading() {
  return (
    <Box sx={{ px: { xs: 2, md: 4 }, py: 3, display: "flex", flexDirection: "column", gap: 2 }}>
      {/* Page title */}
      <Skeleton variant="text" width={180} height={40} />
      <Skeleton variant="text" width={320} height={20} sx={{ mt: -1 }} />

      {/* KPI chips */}
      <Box sx={{ display: "flex", gap: 1 }}>
        {[80, 100, 120, 90].map((w, i) => (
          <Skeleton key={i} variant="rounded" width={w} height={30} sx={{ borderRadius: 4 }} />
        ))}
      </Box>

      {/* Tab bar */}
      <Box sx={{ display: "flex", gap: 3, borderBottom: 1, borderColor: "divider", pb: 0 }}>
        <Skeleton variant="text" width={90} height={40} />
        <Skeleton variant="text" width={130} height={40} />
      </Box>

      {/* Filter bar */}
      <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
        <Skeleton variant="rounded" width={90} height={32} sx={{ borderRadius: 2 }} />
        <Box sx={{ flex: 1 }} />
        <Skeleton variant="text" width={110} height={20} />
      </Box>

      {/* Table header */}
      <Box sx={{ display: "flex", gap: 2 }}>
        {[220, 120, 80, 110, 80, 80].map((w, i) => (
          <Skeleton key={i} variant="text" width={w} height={20} />
        ))}
      </Box>

      {/* Table rows */}
      {Array.from({ length: 8 }).map((_, i) => (
        <Box key={i} sx={{ display: "flex", gap: 2, alignItems: "center" }}>
          <Skeleton variant="rounded" width={220} height={36} sx={{ borderRadius: 1 }} />
          <Skeleton variant="text" width={120} height={20} />
          <Skeleton variant="rounded" width={80} height={20} sx={{ borderRadius: 2 }} />
          <Skeleton variant="rounded" width={110} height={22} sx={{ borderRadius: 4 }} />
          <Skeleton variant="text" width={80} height={20} />
          <Skeleton variant="text" width={80} height={20} />
        </Box>
      ))}
    </Box>
  );
}
