// ─── Raw shapes returned by the FastAPI backend (snake_case) ─────────────────
// These mirror the Pydantic schemas exactly. Never use these in UI components —
// always go through the mappers to get the camelCase frontend types.

export interface RawProspect {
  id: string;
  nom: string;
  type: string;
  pays: string;
  ville: string;
  region: string | null;
  adresse_web: string;
  email_contact: string;
  linkedin_contact: string | null;
  nom_contact: string;
  poste_contact: string;
  nb_chambres: number | null;
  capacite_description: string | null;
  presence_booking: boolean;
  note_booking: number | null;
  presence_expedia: boolean;
  score_activite_digitale: number;
  score_coherence_marche: number;
  score_taille_capacite: number;
  score_contact_decideur: number;
  score_liberte_ota: number;
  score_total: number;
  stage: string;
  commission_standard: number;
  commission_plancher: number;
  langue: string;
  date_ajout: string;
  date_prochain_contact: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface RawProspectListResponse {
  items: RawProspect[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface RawProspectStats {
  nb_par_stage: Record<string, number>;
  score_moyen: number;
  nb_eligibles_outreach: number;
}

export interface RawScorePreviewResponse {
  score_activite_digitale: number;
  score_coherence_marche: number;
  score_taille_capacite: number;
  score_contact_decideur: number;
  score_liberte_ota: number;
  score_total: number;
  stage_recommande: string;
  is_premium: boolean;
}

// ─── Scan ─────────────────────────────────────────────────────────────────────

export interface RawScanJob {
  id: string;
  ville: string;
  pays: string;
  type_partenaire: string;
  limite: number;
  statut: "pending" | "running" | "done" | "error";
  nb_trouves: number;
  nb_ajoutes: number;
  nb_veille: number;
  nb_doublons: number;
  progression: number;
  erreur: string | null;
  created_at: string;
  completed_at: string | null;
}

// ─── Outreach ─────────────────────────────────────────────────────────────────

export interface RawOutreachEmail {
  id: string;
  prospect_id: string;
  sequence_step: "j0" | "j3" | "j7" | "j30";
  variant: "A" | "B" | "C";
  langue: string;
  sujet: string;
  corps: string;
  statut: "draft" | "validated" | "sent" | "opened" | "clicked";
  date_envoi_prevu: string;
  date_envoi_reel: string | null;
  created_at: string;
}

export interface RawNextStepResponse {
  next_step: string | null;
  reason: string;
  emails: RawOutreachEmail[];
}

export interface RawTriggerFollowupsResponse {
  created: number;
  details: Record<string, unknown>[];
}

// ─── Negotiation ──────────────────────────────────────────────────────────────

export interface RawNegotiationMessage {
  id: string;
  prospect_id: string;
  direction: "inbound" | "outbound";
  corps: string;
  date_message: string;
  analyse_intent: string | null;
  analyse_objection: string | null;
  taux_demande: number | null;
  requires_human: boolean;
  created_at: string;
}

export interface RawScenario {
  scenario: string;
  titre: string;
  description: string;
  avantages: string;
  risques: string;
  message_propose: string;
}

export interface RawMessageAnalysis {
  message_id: string;
  intent: string | null;
  intent_score: number | null;
  objection_type: string | null;
  objection_detail: string | null;
  taux_demande: number | null;
  requires_human: boolean;
  scenarios: RawScenario[];
}

// ─── Contracts ────────────────────────────────────────────────────────────────

export interface RawContractClauses {
  parties: string;
  objet: string;
  commission_clause: string;
  obligations_bab: string;
  obligations_partner: string;
  duree_clause: string;
  confidentialite: string;
  rgpd_clause: string;
  juridiction: string;
  post_signature_note: string;
}

export type ContractStatus = "draft" | "generated" | "sent_to_partner" | "signed" | "declined";

export interface RawContract {
  id: string;
  prospect_id: string;
  status: ContractStatus;
  partner_name: string;
  partner_type: string;
  partner_email: string | null;
  country: string;
  language: string;
  commission: number;
  estimated_annual_value: number | null;
  clauses: RawContractClauses | null;
  has_pdf: boolean;
  human_review_required: boolean;
  human_review_reason: string | null;
  partner_reply: string | null;
  partner_replied_at: string | null;
  sent_at: string | null;
  signed_at: string | null;
  declined_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RawContractListResponse {
  items: RawContract[];
  total: number;
}
