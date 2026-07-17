"use client";

import { useState, useEffect, useCallback } from "react";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ScheduledScanSettings {
  enabled: boolean;
  windowStartHour: number; // 0-23, default 1  (01:00)
  windowEndHour: number;   // 0-23, default 5  (05:00)
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

// ─── Morocco timezone helper ────────────────────────────────────────────────

const MOROCCO_TZ = "Africa/Casablanca";

function moroccoDateStr(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: MOROCCO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function moroccoWallClockToUTC(yyyy_mm_dd: string, hour: number): Date {
  const probe = new Date(`${yyyy_mm_dd}T${String(hour).padStart(2, "0")}:00:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: MOROCCO_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(probe);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  const moroccoAtProbe = new Date(
    `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}Z`
  );
  const offsetMs = moroccoAtProbe.getTime() - probe.getTime();
  return new Date(probe.getTime() - offsetMs);
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
  windowStartHour: number;
  windowEndHour: number;
  targetDate?: Date; // anchor to this specific day instead of "next occurrence"
}): ScheduledScanBatch[] {
  const { types, limiteParType, windowStartHour, windowEndHour, targetDate } = params;

  // One batch per type, each gets limiteParType
  const batches: { typePartenaire: string; limite: number }[] = types.map((type) => ({
    typePartenaire: type,
    limite: limiteParType,
  }));

  // Build window timestamps in Morocco time (Africa/Casablanca).
  const anchor = targetDate ? new Date(targetDate) : new Date();
  const todayMorocco = moroccoDateStr(anchor);

  const windowStart = moroccoWallClockToUTC(todayMorocco, windowStartHour);
  if (!targetDate && windowStart.getTime() <= Date.now()) {
    windowStart.setTime(windowStart.getTime() + 24 * 60 * 60 * 1000);
  }

  const windowEnd = moroccoWallClockToUTC(todayMorocco, windowEndHour);
  if (windowEnd.getTime() <= windowStart.getTime()) {
    windowEnd.setTime(windowEnd.getTime() + 24 * 60 * 60 * 1000);
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
