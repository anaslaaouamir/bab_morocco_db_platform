import type { Prospect, PartnerType, PipelineStage } from "@/types/prospect";
import { scoreTotal } from "@/types/prospect";

// ─── Filter state ──────────────────────────────────────────────────────────

export interface FilterState {
  types: PartnerType[];       // empty = all types shown
  stages: PipelineStage[];    // empty = all stages shown
  scoreMin: 75 | 85 | null;  // null = no minimum
  marches: string[];          // 'Maroc' | 'France' | 'EAU' | 'Golfe' — empty = all
  search: string;             // free-text filter on prospect name
}

export const EMPTY_FILTERS: FilterState = {
  types: [],
  stages: [],
  scoreMin: null,
  marches: [],
  search: "",
};

export function hasActiveFilters(f: FilterState): boolean {
  return (
    f.types.length > 0 ||
    f.stages.length > 0 ||
    f.scoreMin !== null ||
    f.marches.length > 0 ||
    f.search.trim() !== ""
  );
}

export function countActiveFilters(f: FilterState): number {
  return (
    f.types.length +
    f.stages.length +
    (f.scoreMin !== null ? 1 : 0) +
    f.marches.length +
    (f.search.trim() !== "" ? 1 : 0)
  );
}

// ─── Marché matching ───────────────────────────────────────────────────────

const GOLFE_PAYS = ["Émirats Arabes Unis", "Arabie Saoudite", "Qatar", "Koweït", "Bahreïn"];

function matchesMarche(prospect: Prospect, marche: string): boolean {
  switch (marche) {
    case "Maroc":
      return prospect.pays === "Maroc";
    case "France":
      return prospect.pays === "France";
    case "EAU":
      return prospect.pays === "Émirats Arabes Unis";
    case "Golfe":
      return GOLFE_PAYS.includes(prospect.pays) || prospect.type === "to_golfe";
    default:
      return false;
  }
}

// ─── Core filter function ──────────────────────────────────────────────────

export function applyFilters(
  prospects: Prospect[],
  filters: FilterState
): Prospect[] {
  const q = filters.search.trim().toLowerCase();
  return prospects.filter((p) => {
    if (q && !p.nom.toLowerCase().includes(q)) return false;
    if (filters.types.length > 0 && !filters.types.includes(p.type)) return false;
    if (filters.stages.length > 0 && !filters.stages.includes(p.stage)) return false;
    if (filters.scoreMin !== null && scoreTotal(p.score) < filters.scoreMin) return false;
    if (
      filters.marches.length > 0 &&
      !filters.marches.some((m) => matchesMarche(p, m))
    )
      return false;
    return true;
  });
}

// ─── Toggle helpers ────────────────────────────────────────────────────────

export function toggleItem<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr.filter((i) => i !== item) : [...arr, item];
}
