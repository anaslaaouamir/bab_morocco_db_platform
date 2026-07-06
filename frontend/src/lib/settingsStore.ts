"use client";

import { useState, useEffect, useCallback } from "react";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ScheduledScanSettings {
  enabled: boolean;
  windowStartHour: number; // 0-23, default 1  (01:00)
  windowEndHour: number;   // 0-23, default 5  (05:00)
  batchSize: number;       // prospects per batch, default 20
}

export interface AppSettings {
  scheduledScan: ScheduledScanSettings;
}

// ─── Defaults ───────────────────────────────────────────────────────────────

const DEFAULTS: AppSettings = {
  scheduledScan: {
    enabled: false,
    windowStartHour: 1,
    windowEndHour: 5,
    batchSize: 20,
  },
};

const SETTINGS_KEY  = "bab_morocco_settings";

// ─── Raw localStorage helpers ────────────────────────────────────────────────

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      scheduledScan: {
        ...DEFAULTS.scheduledScan,
        ...(parsed.scheduledScan ?? {}),
      },
    };
  } catch {
    return DEFAULTS;
  }
}

export function saveSettings(settings: AppSettings): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// ─── Schedule builder ────────────────────────────────────────────────────────

/**
 * A batch ready to submit to POST /scan/start with its own scheduled_at —
 * the backend (not the browser) parks it and fires it when due, see
 * SCHEDULED_SCAN_CALENDAR_PLAN.md Phase A/B.
 */
export interface ScheduledScanBatch {
  typePartenaire: string;
  limite: number;
  scheduledAt: string; // ISO timestamp when this batch should fire
}

/**
 * Build a flat list of batches spread evenly across a time window.
 *
 * Logic:
 *   - Window = [windowStartHour, windowEndHour) on targetDate if given,
 *     otherwise the next occurrence of the window (today if it hasn't
 *     started yet, otherwise tomorrow).
 *   - Batches are distributed at equal intervals across the window duration.
 */
export function buildScheduledJobs(params: {
  types: string[];
  limiteParType: number;
  batchSize: number;
  windowStartHour: number;
  windowEndHour: number;
  targetDate?: Date; // anchor to this specific day instead of "next occurrence"
}): ScheduledScanBatch[] {
  const { types, limiteParType, batchSize, windowStartHour, windowEndHour, targetDate } = params;

  // Build flat list: for each type, ceil(limiteParType / batchSize) batches
  const batches: { typePartenaire: string; limite: number }[] = [];
  for (const type of types) {
    const nbBatches = Math.max(1, Math.ceil(limiteParType / batchSize));
    for (let b = 0; b < nbBatches; b++) {
      const isLast = b === nbBatches - 1;
      const effectiveLimite = isLast ? limiteParType - b * batchSize : batchSize;
      batches.push({ typePartenaire: type, limite: Math.max(1, effectiveLimite) });
    }
  }

  // Compute window start timestamp
  const windowStart = targetDate ? new Date(targetDate) : new Date();
  windowStart.setHours(windowStartHour, 0, 0, 0);
  if (!targetDate) {
    const now = new Date();
    if (windowStart <= now) {
      // Window already started/passed today → schedule for tomorrow
      windowStart.setDate(windowStart.getDate() + 1);
    }
  }
  const windowEnd = new Date(windowStart);
  windowEnd.setHours(windowEndHour, 0, 0, 0);
  if (windowEnd <= windowStart) {
    windowEnd.setDate(windowEnd.getDate() + 1);
  }

  const windowMs = windowEnd.getTime() - windowStart.getTime();
  const intervalMs = batches.length > 1 ? windowMs / (batches.length - 1) : 0;

  return batches.map((b, i) => ({
    typePartenaire: b.typePartenaire,
    limite: b.limite,
    scheduledAt: new Date(windowStart.getTime() + i * intervalMs).toISOString(),
  }));
}

// ─── React hook ──────────────────────────────────────────────────────────────

export function useSettings() {
  const [settings, setSettingsState] = useState<AppSettings>(DEFAULTS);

  useEffect(() => {
    setSettingsState(loadSettings());
  }, []);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettingsState((prev) => {
      const next: AppSettings = {
        ...prev,
        ...patch,
        scheduledScan: { ...prev.scheduledScan, ...(patch.scheduledScan ?? {}) },
      };
      saveSettings(next);
      return next;
    });
  }, []);

  return { settings, updateSettings };
}
