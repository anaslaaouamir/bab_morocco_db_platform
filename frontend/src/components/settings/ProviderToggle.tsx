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
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import TextField from "@mui/material/TextField";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Alert from "@mui/material/Alert";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import SmartToyRoundedIcon from "@mui/icons-material/SmartToyRounded";

import { apiSettingsApi, type ApiKeyInfo, type ModelOption } from "@/lib/api";
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

const TIER_LABELS: Record<string, string> = {
  budget: "Budget",
  standard: "Standard",
  premium: "Premium",
};

const TIER_COLORS: Record<string, "default" | "primary" | "warning"> = {
  budget: "warning",
  standard: "primary",
  premium: "default",
};

const CUSTOM_MODEL_VALUE = "__custom__";

export default function ProviderToggle() {
  const { showSnackbar } = useSnackbar();
  const [provider, setProvider] = useState<Provider>("claude");
  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [modelOptions, setModelOptions] = useState<Record<string, ModelOption[]>>({});
  const [claudeModel, setClaudeModel] = useState("claude-sonnet-4-6");
  const [openaiModel, setOpenaiModel] = useState("gpt-4o");
  const [claudeCustom, setClaudeCustom] = useState("");
  const [openaiCustom, setOpenaiCustom] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsRes, keysRes, modelsRes] = await Promise.all([
        apiSettingsApi.getSettings(),
        apiSettingsApi.getKeys(),
        apiSettingsApi.getModels(),
      ]);
      setProvider(settingsRes.default_ai_provider === "openai" ? "openai" : "claude");
      setKeys(keysRes.keys);
      setModelOptions(modelsRes);

      const savedClaude = settingsRes.default_claude_model || "claude-sonnet-4-6";
      const savedOpenai = settingsRes.default_openai_model || "gpt-4o";

      const claudeKnown = (modelsRes.claude || []).some((m: ModelOption) => m.id === savedClaude);
      if (claudeKnown) {
        setClaudeModel(savedClaude);
      } else {
        setClaudeModel(CUSTOM_MODEL_VALUE);
        setClaudeCustom(savedClaude);
      }

      const openaiKnown = (modelsRes.openai || []).some((m: ModelOption) => m.id === savedOpenai);
      if (openaiKnown) {
        setOpenaiModel(savedOpenai);
      } else {
        setOpenaiModel(CUSTOM_MODEL_VALUE);
        setOpenaiCustom(savedOpenai);
      }
    } catch {
      // Keep defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selectedKeySet = keys.find((k) => k.key === PROVIDER_KEY_NAMES[provider])?.is_set ?? false;

  async function saveSettings(updates: Record<string, unknown>) {
    setSaving(true);
    try {
      await apiSettingsApi.updateSettings(updates);
      showSnackbar({ message: "Paramètres IA mis à jour.", severity: "success", duration: 3000 });
    } catch (e: unknown) {
      showSnackbar({
        message: e instanceof Error ? e.message : "Erreur lors de la mise à jour.",
        severity: "error",
        duration: 5000,
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleProviderChange(_: React.MouseEvent<HTMLElement>, value: Provider | null) {
    if (!value || value === provider) return;
    const previous = provider;
    setProvider(value);
    try {
      await saveSettings({ default_ai_provider: value });
    } catch {
      setProvider(previous);
    }
  }

  function resolveModelId(prov: Provider): string {
    if (prov === "claude") {
      return claudeModel === CUSTOM_MODEL_VALUE ? claudeCustom : claudeModel;
    }
    return openaiModel === CUSTOM_MODEL_VALUE ? openaiCustom : openaiModel;
  }

  async function handleModelChange(prov: Provider, value: string) {
    if (prov === "claude") {
      setClaudeModel(value);
      if (value !== CUSTOM_MODEL_VALUE) {
        setClaudeCustom("");
        await saveSettings({ default_claude_model: value });
      }
    } else {
      setOpenaiModel(value);
      if (value !== CUSTOM_MODEL_VALUE) {
        setOpenaiCustom("");
        await saveSettings({ default_openai_model: value });
      }
    }
  }

  async function handleCustomModelBlur(prov: Provider) {
    const value = prov === "claude" ? claudeCustom.trim() : openaiCustom.trim();
    if (!value) return;
    const key = prov === "claude" ? "default_claude_model" : "default_openai_model";
    await saveSettings({ [key]: value });
  }

  function getContractWarning(prov: Provider): boolean {
    const id = resolveModelId(prov);
    const options = modelOptions[prov] || [];
    const opt = options.find((m) => m.id === id);
    return opt?.contract_warning === true;
  }

  function renderModelSelector(prov: Provider) {
    const options = modelOptions[prov] || [];
    const selectedValue = prov === "claude" ? claudeModel : openaiModel;
    const customValue = prov === "claude" ? claudeCustom : openaiCustom;
    const setCustom = prov === "claude" ? setClaudeCustom : setOpenaiCustom;
    const showWarning = getContractWarning(prov);

    return (
      <Box sx={{ mt: 1.5 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel>Modèle {PROVIDER_LABELS[prov]}</InputLabel>
            <Select
              value={selectedValue}
              label={`Modèle ${PROVIDER_LABELS[prov]}`}
              onChange={(e) => handleModelChange(prov, e.target.value)}
              disabled={saving}
            >
              {options.map((m) => (
                <MenuItem key={m.id} value={m.id}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, width: "100%" }}>
                    <span>{m.label}</span>
                    <Chip
                      label={TIER_LABELS[m.tier] || m.tier}
                      size="small"
                      color={TIER_COLORS[m.tier] || "default"}
                      variant="outlined"
                      sx={{ fontSize: "0.625rem", height: 20, ml: "auto" }}
                    />
                  </Box>
                </MenuItem>
              ))}
              <MenuItem value={CUSTOM_MODEL_VALUE}>
                <em>Modèle personnalisé</em>
              </MenuItem>
            </Select>
          </FormControl>

          {selectedValue === CUSTOM_MODEL_VALUE && (
            <TextField
              size="small"
              label="ID du modèle"
              placeholder={prov === "claude" ? "claude-opus-5" : "gpt-5"}
              value={customValue}
              onChange={(e) => setCustom(e.target.value)}
              onBlur={() => handleCustomModelBlur(prov)}
              disabled={saving}
              sx={{ minWidth: 200 }}
            />
          )}
        </Box>

        {showWarning && (
          <Alert
            severity="warning"
            icon={<WarningAmberRoundedIcon fontSize="small" />}
            sx={{ mt: 1, borderRadius: 2, py: 0.25 }}
          >
            Ce modèle peut produire des résultats incomplets pour la génération de contrats.
          </Alert>
        )}
      </Box>
    );
  }

  return (
    <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden", mb: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 2.5, py: 2, bgcolor: "action.hover" }}>
        <SmartToyRoundedIcon sx={{ color: "primary.main", fontSize: 22 }} />
        <Typography variant="titleMedium" sx={{ fontWeight: 700, flex: 1 }}>
          Fournisseur & Modèle IA
        </Typography>
      </Box>

      <Divider />

      <Box sx={{ px: 2.5, py: 2.5, display: "flex", flexDirection: "column", gap: 1.5 }}>
        {loading ? (
          <>
            <Skeleton variant="rounded" height={40} sx={{ borderRadius: 2, maxWidth: 260 }} />
            <Skeleton variant="rounded" height={40} sx={{ borderRadius: 2, maxWidth: 260 }} />
          </>
        ) : (
          <>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
              <ToggleButtonGroup
                exclusive
                value={provider}
                onChange={handleProviderChange}
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

            <Divider sx={{ my: 0.5 }} />

            <Typography variant="labelMedium" color="text.secondary" sx={{ fontWeight: 600 }}>
              Modèle par fournisseur
            </Typography>

            {renderModelSelector("claude")}
            {renderModelSelector("openai")}
          </>
        )}

        <Typography variant="bodySmall" color="text.secondary" sx={{ mt: 0.5 }}>
          Le fournisseur non-sélectionné sert de secours automatique. Le modèle personnalisé permet d&apos;utiliser un nouveau modèle dès sa sortie.
        </Typography>
      </Box>
    </Paper>
  );
}
