import type { Prospect, PartnerType, PipelineStage, OutreachLanguage } from "@/types/prospect";
import type { RawProspect } from "./types";

// ─── Prospect: backend snake_case → frontend camelCase ───────────────────────

export function rawToProspect(r: RawProspect): Prospect {
  return {
    id: r.id,
    nom: r.nom,
    type: r.type as PartnerType,
    pays: r.pays,
    ville: r.ville,
    region: r.region ?? undefined,
    adresseWeb: r.adresse_web,
    emailContact: r.email_contact,
    linkedinContact: r.linkedin_contact ?? undefined,
    nomContact: r.nom_contact,
    posteContact: r.poste_contact,
    nbChambres: r.nb_chambres ?? undefined,
    capaciteDescription: r.capacite_description ?? undefined,
    presenceBooking: r.presence_booking,
    noteBooking: r.note_booking ?? undefined,
    presenceExpedia: r.presence_expedia,
    score: {
      activiteDigitale: r.score_activite_digitale,
      coherenceMarche: r.score_coherence_marche,
      tailleCapacite: r.score_taille_capacite,
      contactDecideur: r.score_contact_decideur,
      liberteOta: r.score_liberte_ota,
    },
    stage: r.stage as PipelineStage,
    commissionStandard: r.commission_standard,
    commissionPlancher: r.commission_plancher,
    langue: r.langue as OutreachLanguage,
    dateAjout: r.date_ajout,
    dateProchainContact: r.date_prochain_contact ?? undefined,
    notes: r.notes ?? undefined,
  };
}

// ─── Prospect: frontend camelCase → backend snake_case (create payload) ──────

export function prospectToCreate(p: Omit<Prospect, "id" | "score">) {
  return {
    nom: p.nom,
    type: p.type,
    pays: p.pays,
    ville: p.ville,
    region: p.region,
    adresse_web: p.adresseWeb,
    email_contact: p.emailContact,
    linkedin_contact: p.linkedinContact,
    nom_contact: p.nomContact,
    poste_contact: p.posteContact,
    nb_chambres: p.nbChambres,
    capacite_description: p.capaciteDescription,
    presence_booking: p.presenceBooking,
    note_booking: p.noteBooking,
    presence_expedia: p.presenceExpedia,
    stage: p.stage,
    commission_standard: p.commissionStandard,
    commission_plancher: p.commissionPlancher,
    langue: p.langue,
    date_ajout: p.dateAjout,
    date_prochain_contact: p.dateProchainContact,
    notes: p.notes,
  };
}

// ─── Prospect: frontend camelCase → backend snake_case (update payload) ──────
// Only sends fields that are defined (avoids overwriting with null).

export function prospectToUpdate(partial: Partial<Prospect>) {
  const out: Record<string, unknown> = {};
  if (partial.nom !== undefined)               out.nom = partial.nom;
  if (partial.type !== undefined)              out.type = partial.type;
  if (partial.pays !== undefined)              out.pays = partial.pays;
  if (partial.ville !== undefined)             out.ville = partial.ville;
  if (partial.region !== undefined)            out.region = partial.region;
  if (partial.adresseWeb !== undefined)        out.adresse_web = partial.adresseWeb;
  if (partial.emailContact !== undefined)      out.email_contact = partial.emailContact;
  if (partial.linkedinContact !== undefined)   out.linkedin_contact = partial.linkedinContact;
  if (partial.nomContact !== undefined)        out.nom_contact = partial.nomContact;
  if (partial.posteContact !== undefined)      out.poste_contact = partial.posteContact;
  if (partial.nbChambres !== undefined)        out.nb_chambres = partial.nbChambres;
  if (partial.capaciteDescription !== undefined) out.capacite_description = partial.capaciteDescription;
  if (partial.presenceBooking !== undefined)   out.presence_booking = partial.presenceBooking;
  if (partial.noteBooking !== undefined)       out.note_booking = partial.noteBooking;
  if (partial.presenceExpedia !== undefined)   out.presence_expedia = partial.presenceExpedia;
  if (partial.stage !== undefined)             out.stage = partial.stage;
  if (partial.commissionStandard !== undefined) out.commission_standard = partial.commissionStandard;
  if (partial.commissionPlancher !== undefined) out.commission_plancher = partial.commissionPlancher;
  if (partial.langue !== undefined)            out.langue = partial.langue;
  if (partial.dateProchainContact !== undefined) out.date_prochain_contact = partial.dateProchainContact;
  if (partial.notes !== undefined)             out.notes = partial.notes;
  return out;
}
