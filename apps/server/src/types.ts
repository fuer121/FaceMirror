import type { AnalysisResult, ResultRecord } from "@facemirror/shared";

export type PersistedRecord = ResultRecord & {
  localSourcePath?: string;
  localPosterPath?: string;
};

export type AnalysisPayload = AnalysisResult & {
  isSingleFace: boolean;
  faceCount: number;
  faceConfidence: number;
  photoReadiness: "good" | "low_light" | "blurred" | "multiple_faces" | "no_face";
};

