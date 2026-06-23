// ─── Partner classification ────────────────────────────────────────────────

export type PartnerType =
  | "hotel_riad"           // Hôtels & Riads Maroc 3*→5*
  | "hotel_luxe"           // Hôtels luxe 5* (Maroc / EAU / ES)
  | "tour_operateur"       // Tour-opérateurs Europe
  | "agence_voyage"        // Agences voyage B2B
  | "prestataire_activites"// Prestataires activités
  | "transport"            // Transport / Transferts
  | "to_golfe"             // TO Golfe (EAU / SA / QA)
  | "mice";                // Agences MICE / Incentive

export type PipelineStage =
  | "prospection"
  | "qualification"
  | "outreach"
  | "negociation"
  | "closing"
  | "activation_ota"
  | "veille"
  | "perdu";

export type OutreachLanguage = "fr" | "en" | "ar" | "es" | "de";

// ─── Scoring breakdown (spec §4) ──────────────────────────────────────────

export interface ScoreBreakdown {
  activiteDigitale: number;    // max 25 — présence web, avis, OTAs concurrentes
  coherenceMarche: number;     // max 25 — clientèle alignée Europe / Golfe
  tailleCapacite: number;      // max 20 — nb chambres / activités, volume potentiel
  contactDecideur: number;     // max 15 — email direct ou LinkedIn DG/commercial
  liberteOta: number;          // max 15 — absence d'exclusivité OTA concurrente
}

export function scoreTotal(s: ScoreBreakdown): number {
  return (
    s.activiteDigitale +
    s.coherenceMarche +
    s.tailleCapacite +
    s.contactDecideur +
    s.liberteOta
  );
}

// ─── Core prospect entity ──────────────────────────────────────────────────

export interface Prospect {
  id: string;
  nom: string;
  type: PartnerType;
  pays: string;
  ville: string;
  region?: string;
  adresseWeb: string;
  emailContact: string;
  linkedinContact?: string;
  nomContact: string;
  posteContact: string;
  nbChambres?: number;
  capaciteDescription?: string;
  presenceBooking: boolean;
  noteBooking?: number;
  presenceExpedia: boolean;
  score: ScoreBreakdown;
  stage: PipelineStage;
  commissionStandard: number;   // %
  commissionPlancher: number;   // %
  langue: OutreachLanguage;
  dateAjout: string;            // ISO YYYY-MM-DD
  dateProchainContact?: string; // ISO YYYY-MM-DD
  notes?: string;
}

// ─── Display helpers ───────────────────────────────────────────────────────

export const PARTNER_TYPE_LABELS: Record<PartnerType, string> = {
  hotel_riad: "Hôtel / Riad",
  hotel_luxe: "Hôtel Luxe 5★",
  tour_operateur: "Tour-opérateur",
  agence_voyage: "Agence Voyage",
  prestataire_activites: "Activités",
  transport: "Transport",
  to_golfe: "TO Golfe",
  mice: "MICE",
};

export const STAGE_LABELS: Record<PipelineStage, string> = {
  prospection: "Prospection",
  qualification: "Qualification",
  outreach: "Outreach",
  negociation: "Négociation",
  closing: "Closing",
  activation_ota: "Activation OTA",
  veille: "Mis en veille",
  perdu: "Perdu",
};

export const LANGUAGE_FLAGS: Record<OutreachLanguage, string> = {
  fr: "🇫🇷",
  en: "🇬🇧",
  ar: "🇲🇦",
  es: "🇪🇸",
  de: "🇩🇪",
};

export const SCORE_THRESHOLDS = {
  OUTREACH: 75,   // required to move to outreach
  HIGH: 85,       // colour: success
  MID: 75,        // colour: warning
} as const;

export function scoreColor(total: number): "success" | "warning" | "error" {
  if (total >= SCORE_THRESHOLDS.HIGH) return "success";
  if (total >= SCORE_THRESHOLDS.MID) return "warning";
  return "error";
}
