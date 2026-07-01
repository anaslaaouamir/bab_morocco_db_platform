export { ApiError, downloadBlob } from "./base";
export { authApi } from "./auth";
export type { UserOut, UserRole, TokenResponse, UserCreateResponse, UserUpdatePayload, ResetPasswordResponse } from "./auth";
export { rawToProspect } from "./mappers";
export type {
  RawScanJob,
  RawOutreachEmail,
  RawNextStepResponse,
  RawTriggerFollowupsResponse,
  RawNegotiationMessage,
  RawMessageAnalysis,
  RawScenario,
  RawScorePreviewResponse,
  RawProspectStats,
  RawContract,
  RawContractClauses,
  RawContractListResponse,
  ContractStatus,
} from "./types";

import { apiFetch, apiFetchBlob } from "./base";
import { rawToProspect, prospectToCreate, prospectToUpdate } from "./mappers";
import type {
  RawProspect,
  RawProspectListResponse,
  RawProspectStats,
  RawScorePreviewResponse,
  RawScanJob,
  RawOutreachEmail,
  RawNextStepResponse,
  RawTriggerFollowupsResponse,
  RawNegotiationMessage,
  RawMessageAnalysis,
  RawContract,
  RawContractListResponse,
} from "./types";
import type { Prospect, PipelineStage, PartnerType, OutreachLanguage } from "@/types/prospect";

// ─── Health ───────────────────────────────────────────────────────────────────

export const healthApi = {
  check: () =>
    apiFetch<{ status: string; version: string; db: string }>("/health"),
};

// ─── Prospects ────────────────────────────────────────────────────────────────

export interface ProspectListParams {
  page?: number;
  pageSize?: number;
  stage?: PipelineStage;
  type?: PartnerType;
  scoreMin?: number;
  pays?: string;
  langue?: OutreachLanguage;
  assignedToFilter?: string;
}

export interface ProspectListResult {
  items: Prospect[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export interface ScorePreviewParams {
  adresseWeb?: string;
  pays?: string;
  emailContact?: string;
  linkedinContact?: string;
  presenceBooking?: boolean;
  noteBooking?: number;
  presenceExpedia?: boolean;
  nbChambres?: number;
  capaciteDescription?: string;
}

export const prospectsApi = {
  list: async (params: ProspectListParams = {}): Promise<ProspectListResult> => {
    const qs = new URLSearchParams();
    if (params.page)      qs.set("page",       String(params.page));
    if (params.pageSize)  qs.set("page_size",   String(params.pageSize));
    if (params.stage)     qs.set("stage",        params.stage);
    if (params.type)      qs.set("type",         params.type);
    if (params.scoreMin)  qs.set("score_min",    String(params.scoreMin));
    if (params.pays)      qs.set("pays",         params.pays);
    if (params.langue)              qs.set("langue",              params.langue);
    if (params.assignedToFilter)   qs.set("assigned_to_filter",  params.assignedToFilter);
    const query = qs.toString();
    const raw = await apiFetch<RawProspectListResponse>(`/prospects${query ? `?${query}` : ""}`);
    return {
      items:    raw.items.map(rawToProspect),
      total:    raw.total,
      page:     raw.page,
      pageSize: raw.page_size,
      pages:    raw.pages,
    };
  },

  get: async (id: string): Promise<Prospect> => {
    const raw = await apiFetch<RawProspect>(`/prospects/${id}`);
    return rawToProspect(raw);
  },

  create: async (prospect: Omit<Prospect, "id" | "score">): Promise<Prospect> => {
    const raw = await apiFetch<RawProspect>("/prospects", {
      method: "POST",
      body: JSON.stringify(prospectToCreate(prospect)),
    });
    return rawToProspect(raw);
  },

  update: async (id: string, partial: Partial<Prospect>): Promise<Prospect> => {
    const raw = await apiFetch<RawProspect>(`/prospects/${id}`, {
      method: "PUT",
      body: JSON.stringify(prospectToUpdate(partial)),
    });
    return rawToProspect(raw);
  },

  patchStage: async (id: string, stage: PipelineStage): Promise<Prospect> => {
    const raw = await apiFetch<RawProspect>(`/prospects/${id}/stage`, {
      method: "PATCH",
      body: JSON.stringify({ stage }),
    });
    return rawToProspect(raw);
  },

  delete: async (id: string): Promise<void> => {
    await apiFetch<void>(`/prospects/${id}`, { method: "DELETE" });
  },

  assign: async (prospectId: string, assignedTo: string | null): Promise<void> => {
    await apiFetch<void>(`/prospects/${prospectId}/assign`, {
      method: "PATCH",
      body: JSON.stringify({ assigned_to: assignedTo }),
    });
  },

  stats: (): Promise<RawProspectStats> =>
    apiFetch<RawProspectStats>("/prospects/stats"),

  scorePreview: (params: ScorePreviewParams): Promise<RawScorePreviewResponse> =>
    apiFetch<RawScorePreviewResponse>("/prospects/score-preview", {
      method: "POST",
      body: JSON.stringify({
        adresse_web:          params.adresseWeb ?? "https://example.com",
        pays:                 params.pays ?? "",
        email_contact:        params.emailContact ?? "",
        linkedin_contact:     params.linkedinContact,
        presence_booking:     params.presenceBooking ?? false,
        note_booking:         params.noteBooking,
        presence_expedia:     params.presenceExpedia ?? false,
        nb_chambres:          params.nbChambres,
        capacite_description: params.capaciteDescription,
      }),
    }),
};

// ─── Scan ─────────────────────────────────────────────────────────────────────

export interface ScanStartParams {
  ville: string;
  pays: string;
  typePartenaire: PartnerType;
  limite?: number;
}

export const scanApi = {
  start: (params: ScanStartParams): Promise<RawScanJob> =>
    apiFetch<RawScanJob>("/scan/start", {
      method: "POST",
      body: JSON.stringify({
        ville:           params.ville,
        pays:            params.pays,
        type_partenaire: params.typePartenaire,
        limite:          params.limite ?? 10,
      }),
    }),

  status: (jobId: string): Promise<RawScanJob> =>
    apiFetch<RawScanJob>(`/scan/${jobId}`),

  history: (): Promise<RawScanJob[]> =>
    apiFetch<RawScanJob[]>("/scan/history"),
};

// ─── Outreach ─────────────────────────────────────────────────────────────────

export const outreachApi = {
  generate: (prospectId: string): Promise<RawOutreachEmail[]> =>
    apiFetch<RawOutreachEmail[]>(`/outreach/${prospectId}/generate`, {
      method: "POST",
    }),

  list: (prospectId: string): Promise<RawOutreachEmail[]> =>
    apiFetch<RawOutreachEmail[]>(`/outreach/${prospectId}`),

  nextStep: (prospectId: string): Promise<RawNextStepResponse> =>
    apiFetch<RawNextStepResponse>(`/outreach/${prospectId}/next-step`),

  validate: (emailId: string): Promise<RawOutreachEmail> =>
    apiFetch<RawOutreachEmail>(`/outreach/${emailId}/validate`, { method: "POST" }),

  send: (emailId: string): Promise<RawOutreachEmail> =>
    apiFetch<RawOutreachEmail>(`/outreach/${emailId}/send`, { method: "POST" }),

  triggerFollowup: (prospectId: string): Promise<RawOutreachEmail[]> =>
    apiFetch<RawOutreachEmail[]>(`/outreach/${prospectId}/trigger-followup`, {
      method: "POST",
    }),

  triggerFollowups: (): Promise<RawTriggerFollowupsResponse> =>
    apiFetch<RawTriggerFollowupsResponse>("/outreach/trigger-followups", {
      method: "POST",
    }),
};

// ─── Negotiation ──────────────────────────────────────────────────────────────

// ─── Contracts ────────────────────────────────────────────────────────────────

export const contractsApi = {
  list: (): Promise<RawContractListResponse> =>
    apiFetch<RawContractListResponse>("/contracts"),

  create: (prospectId: string, estimatedAnnualValue?: number): Promise<RawContract> =>
    apiFetch<RawContract>("/contracts", {
      method: "POST",
      body: JSON.stringify({
        prospect_id: prospectId,
        estimated_annual_value: estimatedAnnualValue ?? null,
      }),
    }),

  generate: (contractId: string, clauseOverrides?: Partial<Record<string, string>>): Promise<RawContract> =>
    apiFetch<RawContract>(`/contracts/${contractId}/generate`, {
      method: "POST",
      ...(clauseOverrides && Object.keys(clauseOverrides).length > 0
        ? { body: JSON.stringify({ clause_overrides: clauseOverrides }) }
        : {}),
    }),

  /**
   * Downloads the PDF as a Blob (carries the auth header — the endpoint is
   * protected, so a plain <a href>/window.open can't be used here).
   */
  downloadPdf: (contractId: string): Promise<Blob> =>
    apiFetchBlob(`/contracts/${contractId}/pdf`),

  send: (contractId: string): Promise<RawContract> =>
    apiFetch<RawContract>(`/contracts/${contractId}/send`, { method: "POST" }),

  markSigned: (contractId: string): Promise<RawContract> =>
    apiFetch<RawContract>(`/contracts/${contractId}/mark-signed`, { method: "POST" }),

  markDeclined: (contractId: string): Promise<RawContract> =>
    apiFetch<RawContract>(`/contracts/${contractId}/mark-declined`, { method: "POST" }),

  simulateSigned: (contractId: string): Promise<RawContract> =>
    apiFetch<RawContract>(`/contracts/${contractId}/simulate-signed`, { method: "POST" }),

  submitReply: (contractId: string, replyText: string): Promise<RawContract> =>
    apiFetch<RawContract>(`/contracts/${contractId}/submit-reply`, {
      method: "POST",
      body: JSON.stringify({ reply_text: replyText }),
    }),

  simulateReply: (contractId: string): Promise<RawContract> =>
    apiFetch<RawContract>(`/contracts/${contractId}/simulate-reply`, { method: "POST" }),
};

// ─── Negotiation ──────────────────────────────────────────────────────────────

export const negotiationApi = {
  submitMessage: (prospectId: string, corps: string): Promise<RawMessageAnalysis> =>
    apiFetch<RawMessageAnalysis>(`/negotiation/${prospectId}/message`, {
      method: "POST",
      body: JSON.stringify({ corps }),
    }),

  analysis: (prospectId: string): Promise<RawMessageAnalysis> =>
    apiFetch<RawMessageAnalysis>(`/negotiation/${prospectId}/analysis`),

  history: (prospectId: string): Promise<RawNegotiationMessage[]> =>
    apiFetch<RawNegotiationMessage[]>(`/negotiation/${prospectId}/history`),

  respond: (prospectId: string, scenario: "A" | "B" | "C", customMessage?: string): Promise<RawNegotiationMessage> =>
    apiFetch<RawNegotiationMessage>(`/negotiation/${prospectId}/respond`, {
      method: "POST",
      body: JSON.stringify({ scenario, custom_message: customMessage ?? null }),
    }),

  simulateReply: (prospectId: string): Promise<RawMessageAnalysis> =>
    apiFetch<RawMessageAnalysis>(`/negotiation/${prospectId}/simulate-reply`, {
      method: "POST",
    }),
};
