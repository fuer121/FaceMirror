export type DominantColor = {
  name: string;
  hex: string;
  reason: string;
};

export type AnalysisMode = "color" | "hair" | "style" | "makeup";

export type AnalyticsEventType =
  | "job_created"
  | "render_started"
  | "render_completed"
  | "render_failed"
  | "credit_refunded";

export type PromptConfig = {
  feature: AnalysisMode;
  title: string;
  prompt: string;
  updated_at: string;
};

export type MakeupRegions = {
  base: string;
  brows: string;
  eyes: string;
  blush: string;
  lips: string;
};

export type AnalysisResult = {
  skinTone: string;
  undertone: string;
  colorImpression: string;
  dominantColors: DominantColor[];
  makeupRegions: MakeupRegions;
  strengths: string[];
  risks: string[];
  recommendations: string[];
  posterBrief: string;
};

export type JobStatus = "pending" | "completed" | "failed";

export type ResultRecord = {
  jobId: string;
  feature: AnalysisMode;
  analysisStatus: JobStatus;
  renderStatus: JobStatus;
  analysisJson: AnalysisResult;
  imagePreviewUrl: string;
  posterUrl: string | null;
  createdAt: string;
  expiresAt: string;
};

export type AnalysisResponse = {
  job_id: string;
  feature: AnalysisMode;
  analysis_status: JobStatus;
  analysis_json: AnalysisResult;
  image_preview_url: string;
  expires_at: string;
};

export type RenderResponse = {
  job_id: string;
  feature: AnalysisMode;
  render_status: JobStatus;
  poster_url: string | null;
  expires_at: string;
};

export type CreditsResponse = {
  remaining_credits: number;
  total_credits: number;
};

export type RedeemEntryResponse =
  | {
      mode: "redeemed";
      usage_token: string;
      remaining_credits: number;
      total_credits: number;
    }
  | {
      mode: "admin";
      admin_token: string;
      expires_at: string;
    };

export type AdminRedeemCode = {
  id: string;
  code: string | null;
  code_preview: string;
  status: "available" | "redeemed" | "disabled";
  total_credits: number;
  remaining_credits: number;
  created_at: string;
  redeemed_at: string | null;
  disabled_at: string | null;
};

export type GeneratedRedeemCode = AdminRedeemCode & {
  code: string;
};

export type AdminCodesResponse = {
  codes: AdminRedeemCode[];
};

export type AdminPromptsResponse = {
  prompts: PromptConfig[];
};

export type UpdateAdminPromptResponse = {
  prompt: PromptConfig;
};

export type AnalyticsOverviewResponse = {
  range: {
    from: string;
    to: string;
  };
  totals: {
    jobs_created: number;
    render_started: number;
    render_completed: number;
    render_failed: number;
    success_rate: number;
    credits_total: number;
    credits_remaining: number;
    credits_consumed: number;
  };
  by_feature: Array<{
    feature: AnalysisMode;
    render_started: number;
    render_completed: number;
    render_failed: number;
    avg_duration_ms: number | null;
  }>;
  daily: Array<{
    date: string;
    render_started: number;
    render_completed: number;
    render_failed: number;
  }>;
};

export type AnalyticsEventRecord = {
  id: string;
  job_id: string;
  feature: AnalysisMode;
  event_type: AnalyticsEventType;
  status: "pending" | "completed" | "failed" | "refunded";
  code_id: string | null;
  duration_ms: number | null;
  error_code: string | null;
  created_at: string;
};

export type AnalyticsEventsResponse = {
  events: AnalyticsEventRecord[];
};

export type CreateAdminCodesResponse = {
  codes: GeneratedRedeemCode[];
};

export type ResultResponse = {
  job_id: string;
  feature: AnalysisMode;
  analysis_status: JobStatus;
  render_status: JobStatus;
  analysis_json: AnalysisResult;
  image_preview_url: string;
  poster_url: string | null;
  expires_at: string;
};

export type DeleteResponse = {
  ok: boolean;
  job_id: string;
};

export type AppErrorResponse = {
  error: {
    code: string;
    message: string;
  };
};
