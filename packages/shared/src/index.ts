export type DominantColor = {
  name: string;
  hex: string;
  reason: string;
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
  analysis_status: JobStatus;
  analysis_json: AnalysisResult;
  image_preview_url: string;
  expires_at: string;
};

export type RenderResponse = {
  job_id: string;
  render_status: JobStatus;
  poster_url: string | null;
  expires_at: string;
};

export type ResultResponse = {
  job_id: string;
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
