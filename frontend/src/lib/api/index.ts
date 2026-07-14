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
  RawWaitingReplyItem,
  RawScorePreviewResponse,
  RawProspectStats,
  RawContract,
  RawContractClauses,
  RawContractListResponse,
  ContractStatus,
  ApiUsageResponse,
  ApiUsageByProvider,
  SystemSettingsMap,
  ApiKeyInfo,
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
  RawWaitingReplyItem,
  RawContract,
  RawContractListResponse,
  ApiUsageResponse,
  ApiUsageByProvider,
  SystemSettingsMap,
  ApiKeyInfo,
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
  noteGoogle?: number;
  nbAvisGoogle?: number;
  telephone?: string;
  businessStatus?: string;
  languesDisponibles?: string;
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
        note_google:          params.noteGoogle,
        nb_avis_google:       params.nbAvisGoogle,
        telephone:            params.telephone,
        business_status:      params.businessStatus,
        langues_disponibles:  params.languesDisponibles,
      }),
    }),
};

// ─── Scan ─────────────────────────────────────────────────────────────────────

export interface ScanStartParams {
  ville: string;
  pays: string;
  typePartenaire: PartnerType;
  limite?: number;
  // Omitted or already-due → runs immediately. A future ISO timestamp parks
  // the job server-side (statut="scheduled") until the backend scheduler
  // fires it — see SCHEDULED_SCAN_CALENDAR_PLAN.md.
  scheduledAt?: string;
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
        scheduled_at:    params.scheduledAt,
      }),
    }),

  status: (jobId: string): Promise<RawScanJob> =>
    apiFetch<RawScanJob>(`/scan/${jobId}`),

  history: (): Promise<RawScanJob[]> =>
    apiFetch<RawScanJob[]>("/scan/history"),

  cancel: (jobId: string): Promise<void> =>
    apiFetch<void>(`/scan/${jobId}`, { method: "DELETE" }),
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

  update: (emailId: string, data: { sujet?: string; corps?: string }): Promise<RawOutreachEmail> =>
    apiFetch<RawOutreachEmail>(`/outreach/${emailId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

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

  get: (contractId: string): Promise<RawContract> =>
    apiFetch<RawContract>(`/contracts/${contractId}`),

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

  /** Downloads the PDF the partner attached to their reply, if any (see downloadPdf note). */
  downloadReplyPdf: (contractId: string): Promise<Blob> =>
    apiFetchBlob(`/contracts/${contractId}/reply-pdf`),

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

  respond: (prospectId: string, scenario: "A" | "B" | "C", customMessage?: string, humanValidated?: boolean): Promise<RawNegotiationMessage> =>
    apiFetch<RawNegotiationMessage>(`/negotiation/${prospectId}/respond`, {
      method: "POST",
      body: JSON.stringify({ scenario, custom_message: customMessage ?? null, human_validated: humanValidated ?? false }),
    }),

  simulateReply: (prospectId: string): Promise<RawMessageAnalysis> =>
    apiFetch<RawMessageAnalysis>(`/negotiation/${prospectId}/simulate-reply`, {
      method: "POST",
    }),

  waitingReply: (): Promise<RawWaitingReplyItem[]> =>
    apiFetch<RawWaitingReplyItem[]>("/negotiation/waiting-reply"),
};

// ─── API Settings ────────────────────────────────────────────────────────────

export const apiSettingsApi = {
  usage: (period: "today" | "week" | "month" = "month"): Promise<ApiUsageResponse> =>
    apiFetch<ApiUsageResponse>(`/api-settings/usage?period=${period}`),

  getSettings: (): Promise<SystemSettingsMap> =>
    apiFetch<SystemSettingsMap>("/api-settings/settings"),

  updateSettings: (data: Record<string, unknown>): Promise<SystemSettingsMap> =>
    apiFetch<SystemSettingsMap>("/api-settings/settings", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  getKeys: (): Promise<{ keys: ApiKeyInfo[] }> =>
    apiFetch<{ keys: ApiKeyInfo[] }>("/api-settings/keys"),

  updateKey: (keyName: string, value: string): Promise<ApiKeyInfo> =>
    apiFetch<ApiKeyInfo>(`/api-settings/keys/${keyName}`, {
      method: "PUT",
      body: JSON.stringify({ value }),
    }),

  deleteKey: (keyName: string): Promise<ApiKeyInfo> =>
    apiFetch<ApiKeyInfo>(`/api-settings/keys/${keyName}`, { method: "DELETE" }),
};
