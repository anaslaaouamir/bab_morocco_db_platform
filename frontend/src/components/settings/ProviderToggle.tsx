"use client";

import { useCallback, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Chip from "@mui/material/Chip";
import Skeleton from "@mui/material/Skeleton";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import SmartToyRoundedIcon from "@mui/icons-material/SmartToyRounded";

import { apiSettingsApi, type ApiKeyInfo } from "@/lib/api";
import { useSnackbar } from "@/contexts/SnackbarContext";

type Provider = "claude" | "openai";

const PROVIDER_LABELS: Record<Provider, string> = {
  claude: "Claude",
  openai: "OpenAI",
};

const PROVIDER_KEY_NAMES: Record<Provider, string> = {
  claude: "anthropic_api_key",
  openai: "openai_api_key",
};

export default function ProviderToggle() {
  const { showSnackbar } = useSnackbar();
  const [provider, setProvider] = useState<Provider>("claude");
  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsRes, keysRes] = await Promise.all([
        apiSettingsApi.getSettings(),
        apiSettingsApi.getKeys(),
      ]);
      setProvider(settingsRes.default_ai_provider === "openai" ? "openai" : "claude");
      setKeys(keysRes.keys);
    } catch {
      // Keep defaults — ApiUsagePanel / ApiKeysPanel already surface load errors on this page.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selectedKeySet = keys.find((k) => k.key === PROVIDER_KEY_NAMES[provider])?.is_set ?? false;

  async function handleChange(_: React.MouseEvent<HTMLElement>, value: Provider | null) {
    if (!value || value === provider) return;
    const previous = provider;
    setProvider(value);
    setSaving(true);
    try {
      await apiSettingsApi.updateSettings({ default_ai_provider: value });
      showSnackbar({ message: "Fournisseur IA par défaut mis à jour.", severity: "success", duration: 3000 });
    } catch (e: unknown) {
      setProvider(previous);
      showSnackbar({
        message: e instanceof Error ? e.message : "Erreur lors de la mise à jour.",
        severity: "error",
        duration: 5000,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden", mb: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 2.5, py: 2, bgcolor: "action.hover" }}>
        <SmartToyRoundedIcon sx={{ color: "primary.main", fontSize: 22 }} />
        <Typography variant="titleMedium" sx={{ fontWeight: 700, flex: 1 }}>
          Fournisseur IA par défaut
        </Typography>
      </Box>

      <Divider />

      <Box sx={{ px: 2.5, py: 2.5, display: "flex", flexDirection: "column", gap: 1.5 }}>
        {loading ? (
          <Skeleton variant="rounded" height={40} sx={{ borderRadius: 2, maxWidth: 260 }} />
        ) : (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
            <ToggleButtonGroup
              exclusive
              value={provider}
              onChange={handleChange}
              disabled={saving}
              size="small"
              color="primary"
            >
              <ToggleButton value="claude" sx={{ textTransform: "none", fontWeight: 700, px: 2.5 }}>
                Claude
              </ToggleButton>
              <ToggleButton value="openai" sx={{ textTransform: "none", fontWeight: 700, px: 2.5 }}>
                OpenAI
              </ToggleButton>
            </ToggleButtonGroup>

            {!selectedKeySet && (
              <Chip
                icon={<WarningAmberRoundedIcon sx={{ fontSize: 16 }} />}
                label={`Clé ${PROVIDER_LABELS[provider]} non configurée`}
                size="small"
                color="warning"
                variant="outlined"
                sx={{ fontSize: "0.6875rem" }}
              />
            )}
          </Box>
        )}

        <Typography variant="bodySmall" color="text.secondary">
          Le fournisseur non-sélectionné sert de secours automatique si le principal n&apos;a pas de clé API configurée.
        </Typography>
      </Box>
    </Paper>
  );
}
