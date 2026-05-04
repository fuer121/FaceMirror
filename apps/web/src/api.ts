import type {
  AdminCodesResponse,
  AdminPromptsResponse,
  AnalyticsEventsResponse,
  AnalyticsOverviewResponse,
  AnalysisMode,
  AnalysisResponse,
  AppErrorResponse,
  CreateAdminCodesResponse,
  CreditsResponse,
  RedeemEntryResponse,
  RenderResponse,
  ResultResponse,
  UpdateAdminPromptResponse
} from "@facemirror/shared";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

export class ApiError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  const json = (await response.json()) as T | AppErrorResponse;
  if (!response.ok) {
    const maybeError = json as AppErrorResponse;
    const message = maybeError.error?.message ?? "请求失败";
    const code = maybeError.error?.code;
    throw new ApiError(message, code);
  }
  return json as T;
}

export async function analyzePhoto(file: File, feature: AnalysisMode) {
  const formData = new FormData();
  formData.append("photo", file);
  formData.append("feature", feature);

  const response = await fetch(`${API_BASE_URL}/api/analyze`, {
    method: "POST",
    body: formData
  });

  return parseResponse<AnalysisResponse>(response);
}

export async function renderPoster(jobId: string, usageToken: string) {
  const response = await fetch(`${API_BASE_URL}/api/render`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ job_id: jobId, usage_token: usageToken })
  });

  return parseResponse<RenderResponse>(response);
}

export async function fetchResult(jobId: string) {
  const response = await fetch(`${API_BASE_URL}/api/result/${jobId}`);
  return parseResponse<ResultResponse>(response);
}

export async function fetchCredits(usageToken: string) {
  const response = await fetch(`${API_BASE_URL}/api/credits`, {
    headers: {
      Authorization: `Bearer ${usageToken}`
    }
  });
  return parseResponse<CreditsResponse>(response);
}

export async function redeemEntry(input: string) {
  const response = await fetch(`${API_BASE_URL}/api/redeem/entry`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ input })
  });
  return parseResponse<RedeemEntryResponse>(response);
}

export async function fetchAdminCodes(adminToken: string) {
  const response = await fetch(`${API_BASE_URL}/api/redeem/admin/codes`, {
    headers: {
      Authorization: `Bearer ${adminToken}`
    }
  });
  return parseResponse<AdminCodesResponse>(response);
}

export async function createAdminCodes(adminToken: string, payload: { count: number; credits: number }) {
  const response = await fetch(`${API_BASE_URL}/api/redeem/admin/codes`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  return parseResponse<CreateAdminCodesResponse>(response);
}

export async function disableAdminCode(adminToken: string, id: string) {
  const response = await fetch(`${API_BASE_URL}/api/redeem/admin/codes/${id}/disable`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminToken}`
    }
  });
  return parseResponse<{ code: AdminCodesResponse["codes"][number] }>(response);
}

export async function fetchAdminPrompts(adminToken: string) {
  const response = await fetch(`${API_BASE_URL}/api/redeem/admin/prompts`, {
    headers: {
      Authorization: `Bearer ${adminToken}`
    }
  });
  return parseResponse<AdminPromptsResponse>(response);
}

export async function updateAdminPrompt(adminToken: string, feature: AnalysisMode, prompt: string) {
  const response = await fetch(`${API_BASE_URL}/api/redeem/admin/prompts/${feature}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ prompt })
  });
  return parseResponse<UpdateAdminPromptResponse>(response);
}

export async function fetchAdminAnalyticsOverview(adminToken: string, days: number) {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString()
  });
  const response = await fetch(`${API_BASE_URL}/api/redeem/admin/analytics/overview?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${adminToken}`
    }
  });
  return parseResponse<AnalyticsOverviewResponse>(response);
}

export async function fetchAdminAnalyticsEvents(adminToken: string, days: number) {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
    limit: "30"
  });
  const response = await fetch(`${API_BASE_URL}/api/redeem/admin/analytics/events?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${adminToken}`
    }
  });
  return parseResponse<AnalyticsEventsResponse>(response);
}
