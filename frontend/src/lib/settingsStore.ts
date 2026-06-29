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

// ─── Scheduled job stored in localStorage ──────────────────────────────────

export interface ScheduledScanJob {
  id: string;          // uuid generated client-side
  ville: string;
  pays: string;
  typePartenaire: string;
  limite: number;      // = batchSize
  scheduledAt: string; // ISO timestamp when this batch should fire
  fired: boolean;
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
const JOBS_KEY      = "bab_morocco_scheduled_jobs";

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

export function loadScheduledJobs(): ScheduledScanJob[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(JOBS_KEY);
    return raw ? (JSON.parse(raw) as ScheduledScanJob[]) : [];
  } catch {
    return [];
  }
}

export function saveScheduledJobs(jobs: ScheduledScanJob[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(JOBS_KEY, JSON.stringify(jobs));
}

export function clearFiredJobs(): void {
  const remaining = loadScheduledJobs().filter((j) => !j.fired);
  saveScheduledJobs(remaining);
}

// ─── Schedule builder ────────────────────────────────────────────────────────

/**
 * Build a flat list of ScheduledScanJob entries spread evenly across the next
 * occurrence of the configured time window.
 *
 * Logic:
 *   - Window = [windowStartHour, windowEndHour) today, or tomorrow if the window
 *     has already passed today.
 *   - Jobs are distributed at equal intervals across the window duration.
 */
export function buildScheduledJobs(params: {
  ville: string;
  pays: string;
  types: string[];
  limiteParType: number;
  batchSize: number;
  windowStartHour: number;
  windowEndHour: number;
}): ScheduledScanJob[] {
  const { ville, pays, types, limiteParType, batchSize, windowStartHour, windowEndHour } = params;

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

  // Compute window start timestamp (next occurrence)
  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setHours(windowStartHour, 0, 0, 0);
  if (windowStart <= now) {
    // Window already started/passed today → schedule for tomorrow
    windowStart.setDate(windowStart.getDate() + 1);
  }
  const windowEnd = new Date(windowStart);
  windowEnd.setHours(windowEndHour, 0, 0, 0);
  if (windowEnd <= windowStart) {
    windowEnd.setDate(windowEnd.getDate() + 1);
  }

  const windowMs = windowEnd.getTime() - windowStart.getTime();
  const intervalMs = batches.length > 1 ? windowMs / (batches.length - 1) : 0;

  return batches.map((b, i) => ({
    id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
    ville,
    pays,
    typePartenaire: b.typePartenaire,
    limite: b.limite,
    scheduledAt: new Date(windowStart.getTime() + i * intervalMs).toISOString(),
    fired: false,
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
