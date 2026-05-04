import type { AnalysisMode, AnalysisResult, ResultRecord } from "@facemirror/shared";

export type PersistedRecord = ResultRecord & {
  sourceKey?: string;
  localSourcePath?: string;
  posterKey?: string;
  localPosterPath?: string;
};

export type AnalysisPayload = AnalysisResult & {
  isSingleFace: boolean;
  faceCount: number;
  faceConfidence: number;
  photoReadiness: "good" | "low_light" | "blurred" | "multiple_faces" | "no_face";
};

export type RenderFeature = AnalysisMode;
