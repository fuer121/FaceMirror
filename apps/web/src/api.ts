import type {
  AnalysisResponse,
  AppErrorResponse,
  RenderResponse,
  ResultResponse
} from "@facemirror/shared";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

async function parseResponse<T>(response: Response): Promise<T> {
  const json = (await response.json()) as T | AppErrorResponse;
  if (!response.ok) {
    const maybeError = json as AppErrorResponse;
    const message = maybeError.error?.message ?? "请求失败";
    throw new Error(message);
  }
  return json as T;
}

export async function analyzePhoto(file: File) {
  const formData = new FormData();
  formData.append("photo", file);

  const response = await fetch(`${API_BASE_URL}/api/analyze`, {
    method: "POST",
    body: formData
  });

  return parseResponse<AnalysisResponse>(response);
}

export async function renderPoster(jobId: string) {
  const response = await fetch(`${API_BASE_URL}/api/render`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ job_id: jobId })
  });

  return parseResponse<RenderResponse>(response);
}

export async function fetchResult(jobId: string) {
  const response = await fetch(`${API_BASE_URL}/api/result/${jobId}`);
  return parseResponse<ResultResponse>(response);
}
