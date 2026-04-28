import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import type { AnalysisResponse, ResultResponse } from "@facemirror/shared";
import { ApiError, analyzePhoto, fetchResult, renderPoster } from "./api";
import { compressImage, formatRemainingTime } from "./utils";

type Stage = "idle" | "ready" | "analyzing" | "rendering" | "done" | "error";
type ErrorKind = "photo" | "analysis" | "render";
type AnalysisMode = "color" | "hair" | "style" | "makeup";
type IconName = "palette" | "hair" | "style" | "makeup" | "shield" | "open" | "link" | "upload" | "refresh" | "sparkle" | "loading";

type VisibleError = {
  kind: ErrorKind;
  title: string;
  message: string;
};

const ANALYSIS_FAILURE_CODES = new Set([
  "ANALYSIS_EMPTY_CONTENT",
  "ANALYSIS_INVALID_JSON",
  "ANALYSIS_SCHEMA_MISMATCH"
]);

const capabilityCards = [
  {
    id: "color",
    code: "COLOR",
    icon: "palette",
    title: "色彩分析",
    status: "当前可用",
    description: "生成适合色、不适合色与个人色彩报告。",
    resultTitle: "生成色彩报告",
    placeholder: "色彩报告将在这里生成"
  },
  {
    id: "hair",
    code: "HAIR",
    icon: "hair",
    title: "发型分析",
    status: "即将开放",
    description: "识别脸型比例，推荐发长、刘海和卷度方向。",
    resultTitle: "生成发型建议",
    placeholder: "发型建议将在这里生成"
  },
  {
    id: "style",
    code: "STYLE",
    icon: "style",
    title: "穿搭分析",
    status: "即将开放",
    description: "结合肤色与气质，输出场景化穿搭建议。",
    resultTitle: "生成穿搭方案",
    placeholder: "穿搭方案将在这里生成"
  },
  {
    id: "makeup",
    code: "MAKEUP",
    icon: "makeup",
    title: "妆容建议",
    status: "即将开放",
    description: "按场景输出底妆、眼妆和唇色方向。",
    resultTitle: "生成妆容方案",
    placeholder: "妆容方案将在这里生成"
  }
] satisfies Array<{
  id: AnalysisMode;
  code: string;
  icon: IconName;
  title: string;
  status: string;
  description: string;
  resultTitle: string;
  placeholder: string;
}>;

function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  const classNames = `icon ${className}`.trim();

  switch (name) {
    case "palette":
      return (
        <svg aria-hidden="true" className={classNames} fill="none" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
          <path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor" opacity="0.28" />
        </svg>
      );
    case "hair":
      return (
        <svg aria-hidden="true" className={classNames} fill="none" viewBox="0 0 24 24">
          <path d="M5 9c2-2.4 4-2.4 6 0s4 2.4 6 0" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
          <path d="M5 14c2-2.4 4-2.4 6 0s4 2.4 6 0" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
        </svg>
      );
    case "style":
      return (
        <svg aria-hidden="true" className={classNames} fill="none" viewBox="0 0 24 24">
          <path d="m12 4 8 8-8 8-8-8z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M12 8v8M8 12h8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" opacity="0.45" />
        </svg>
      );
    case "makeup":
      return (
        <svg aria-hidden="true" className={classNames} fill="none" viewBox="0 0 24 24">
          <path d="M12 3.8 13.8 9l5.4 1.2-5.4 1.9L12 20.2l-1.8-8.1-5.4-1.9L10.2 9z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
        </svg>
      );
    case "shield":
      return (
        <svg aria-hidden="true" className={classNames} fill="none" viewBox="0 0 24 24">
          <path d="M12 4.2 18 6v5.4c0 3.9-2.4 6.8-6 8.4-3.6-1.6-6-4.5-6-8.4V6z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="m9.2 12 1.8 1.8 3.9-4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
      );
    case "open":
      return (
        <svg aria-hidden="true" className={classNames} fill="none" viewBox="0 0 24 24">
          <path d="M8 7h9v9" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="m17 7-9.5 9.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
          <path d="M6 10v8h8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
      );
    case "link":
      return (
        <svg aria-hidden="true" className={classNames} fill="none" viewBox="0 0 24 24">
          <path d="M9.8 14.2 14.2 9.8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
          <path d="M10.8 7.6 12 6.4a4 4 0 0 1 5.6 5.6l-1.2 1.2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
          <path d="M13.2 16.4 12 17.6A4 4 0 0 1 6.4 12l1.2-1.2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        </svg>
      );
    case "upload":
      return (
        <svg aria-hidden="true" className={classNames} fill="none" viewBox="0 0 24 24">
          <path d="M12 16V5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
          <path d="m8 9 4-4 4 4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M5 17.5v1.2c0 .7.6 1.3 1.3 1.3h11.4c.7 0 1.3-.6 1.3-1.3v-1.2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        </svg>
      );
    case "refresh":
      return (
        <svg aria-hidden="true" className={classNames} fill="none" viewBox="0 0 24 24">
          <path d="M18.2 9.2A6.5 6.5 0 0 0 6 8.8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
          <path d="M18.5 5.8v3.8h-3.8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M5.8 14.8A6.5 6.5 0 0 0 18 15.2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
          <path d="M5.5 18.2v-3.8h3.8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
      );
    case "loading":
      return (
        <svg aria-hidden="true" className={classNames} fill="none" viewBox="0 0 24 24">
          <circle cx="7" cy="12" r="1.6" fill="currentColor" />
          <circle cx="12" cy="12" r="1.6" fill="currentColor" opacity="0.68" />
          <circle cx="17" cy="12" r="1.6" fill="currentColor" opacity="0.36" />
        </svg>
      );
    case "sparkle":
      return (
        <svg aria-hidden="true" className={classNames} fill="none" viewBox="0 0 24 24">
          <path d="M12 4.5 14 10l5.5 2-5.5 2-2 5.5-2-5.5-5.5-2 5.5-2z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
        </svg>
      );
  }
}

function getStageCopy(stage: Stage) {
  switch (stage) {
    case "analyzing":
      return {
        badge: "分析中",
        title: "正在分析照片内容",
        description: "正在识别肤色、冷暖调和整体妆容倾向，请稍候。"
      };
    case "rendering":
      return {
        badge: "出图中",
        title: "正在生成结果海报",
        description: "分析已完成，正在整理并输出最终结果图。"
      };
    case "done":
      return {
        badge: "已完成",
        title: "结果已生成",
        description: "可以直接查看结果图，链接会在 24 小时后失效。"
      };
    case "ready":
      return {
        badge: "待开始",
        title: "照片已就绪",
        description: "确认照片清晰且为单人正脸后，开始分析。"
      };
    default:
      return {
        badge: "等待上传",
        title: "上传后开始处理",
        description: "先选择一张清晰单人照，再进入分析和出图。"
      };
  }
}

function isPhotoValidationMessage(message: string) {
  return /照片|图片|人脸|单人|正脸|face|selfie|清晰/i.test(message);
}

function toVisibleError(error: unknown, failedStage: "analyzing" | "rendering"): VisibleError {
  const fallbackMessage = error instanceof Error ? error.message : "请求失败，请稍后重试。";
  const apiError = error instanceof ApiError ? error : null;
  const message = apiError?.message ?? fallbackMessage;
  const code = apiError?.code;

  if (failedStage === "rendering") {
    return {
      kind: "render",
      title: "出图失败",
      message
    };
  }

  if (code && ANALYSIS_FAILURE_CODES.has(code)) {
    return {
      kind: "analysis",
      title: "分析失败",
      message
    };
  }

  if (isPhotoValidationMessage(message)) {
    return {
      kind: "photo",
      title: "照片不合规",
      message
    };
  }

  return {
    kind: "analysis",
    title: "分析失败",
    message
  };
}

export default function App() {
  const [stage, setStage] = useState<Stage>("idle");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<ResultResponse | null>(null);
  const [visibleError, setVisibleError] = useState<VisibleError | null>(null);
  const [selectedMode, setSelectedMode] = useState<AnalysisMode>("color");

  const stageCopy = useMemo(() => getStageCopy(stage), [stage]);
  const previewUrl = useMemo(() => (selectedFile ? URL.createObjectURL(selectedFile) : null), [selectedFile]);
  const activeCapability = useMemo(
    () => capabilityCards.find((card) => card.id === selectedMode) ?? capabilityCards[0],
    [selectedMode]
  );
  const isCurrentModeAvailable = selectedMode === "color";

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const resultId = params.get("result");

    if (!resultId) {
      return;
    }

    setStage("rendering");
    fetchResult(resultId)
      .then((payload) => {
        setResult(payload);
        setVisibleError(null);
        setStage("done");
      })
      .catch((error: unknown) => {
        setVisibleError(toVisibleError(error, "rendering"));
        setStage("error");
      });
  }, []);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setSelectedFile(file);
    setResult(null);
    setVisibleError(null);
    setStage("ready");
  }

  async function handleAnalyze() {
    if (!selectedFile || !isCurrentModeAvailable) {
      return;
    }

    let failedStage: "analyzing" | "rendering" = "analyzing";

    try {
      setVisibleError(null);
      setStage("analyzing");
      const compressed = await compressImage(selectedFile);
      const analyzeResponse: AnalysisResponse = await analyzePhoto(compressed);

      setResult({
        job_id: analyzeResponse.job_id,
        analysis_status: analyzeResponse.analysis_status,
        render_status: "pending",
        image_preview_url: analyzeResponse.image_preview_url,
        poster_url: null,
        analysis_json: analyzeResponse.analysis_json,
        expires_at: analyzeResponse.expires_at
      });

      failedStage = "rendering";
      setStage("rendering");

      const renderResponse = await renderPoster(analyzeResponse.job_id);
      const hydrated = await fetchResult(renderResponse.job_id);
      setResult(hydrated);
      setVisibleError(null);
      setStage("done");
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set("result", hydrated.job_id);
      window.history.replaceState({}, "", nextUrl);
    } catch (error: unknown) {
      setVisibleError(toVisibleError(error, failedStage));
      setStage("error");
    }
  }

  return (
    <div className={`page-shell theme-${selectedMode}`}>
      <div className="grain" />
      <main className="app-frame">
        <section className="beauty-console" id="upload">
          <div className="console-header">
            <div>
              <p className="eyebrow">FaceMirror / AI Beauty System</p>
              <h1>你的个人美学分析</h1>
              <p>{activeCapability.description}</p>
            </div>
            <span className="privacy-note">
              <Icon name="shield" />
              24 小时后自动删除
            </span>
          </div>

          <div className="mode-switcher" aria-label="功能切换">
            {capabilityCards.map((card) => {
              const isSelected = selectedMode === card.id;
              return (
                <button
                  aria-pressed={isSelected}
                  className={`mode-card${isSelected ? " is-selected" : ""}`}
                  key={card.id}
                  onClick={() => setSelectedMode(card.id)}
                  type="button"
                >
                  <i aria-hidden="true">
                    <Icon name={card.icon} />
                  </i>
                  <span>{card.title}</span>
                  {isSelected ? <small>{card.status}</small> : null}
                </button>
              );
            })}
          </div>

          <div className="console-stage">
            <div className="result-canvas">
              <div className="theme-mark" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>

              {result?.poster_url && selectedMode === "color" ? (
                <div className="poster-panel">
                  <img className="poster-image" src={result.poster_url} alt="分析海报" />
                  <div className="poster-actions">
                    <a className="secondary-button" href={result.poster_url} target="_blank" rel="noreferrer">
                      <span aria-hidden="true">
                        <Icon name="open" />
                      </span>
                      查看结果图
                    </a>
                    <a className="secondary-button" href={window.location.href}>
                      <span aria-hidden="true">
                        <Icon name="link" />
                      </span>
                      复制链接
                    </a>
                  </div>
                  <small>{formatRemainingTime(result.expires_at)}</small>
                </div>
              ) : stage === "error" && selectedMode === "color" ? (
                <div className="empty-block error-block">
                  <div>
                    <strong>{visibleError?.title ?? "处理失败"}</strong>
                    <p>{visibleError?.message ?? "请求失败，请稍后重试。"}</p>
                  </div>
                </div>
              ) : (
                <div className={`empty-block${isCurrentModeAvailable ? "" : " upcoming-block"}`}>
                  <span className="empty-icon" aria-hidden="true">
                    <Icon name={isCurrentModeAvailable ? "sparkle" : activeCapability.icon} />
                  </span>
                  {!isCurrentModeAvailable ? <small>{activeCapability.status}</small> : null}
                  <strong>{isCurrentModeAvailable ? activeCapability.placeholder : `${activeCapability.title}即将开放`}</strong>
                  <p>{isCurrentModeAvailable ? stageCopy.description : "先体验色彩分析，后续这里会切换为对应的专属分析画布。"}</p>
                </div>
              )}
            </div>

            {previewUrl ? (
              <div className="selected-preview">
                <label className="preview-thumb" aria-label="重新上传照片">
                  <input accept="image/png,image/jpeg" type="file" onChange={handleFileChange} />
                  <img src={previewUrl} alt="已选择照片预览" />
                  <span className="refresh-icon" aria-hidden="true">
                    <Icon name="refresh" />
                  </span>
                </label>
                <div>
                  <span>单人正脸 / 自然光 / 小于 10MB</span>
                  <small>{selectedFile?.name}</small>
                </div>
              </div>
            ) : (
              <div className="upload-controls">
                <label className="upload-pill">
                  <input accept="image/png,image/jpeg" type="file" onChange={handleFileChange} />
                  <span aria-hidden="true">
                    <Icon name="upload" />
                  </span>
                  <span>上传照片</span>
                </label>
              </div>
            )}

            <button
              className="primary-button"
              disabled={!selectedFile || !isCurrentModeAvailable || stage === "analyzing" || stage === "rendering"}
              onClick={handleAnalyze}
            >
              <span aria-hidden="true">
                <Icon name={stage === "analyzing" || stage === "rendering" ? "loading" : "sparkle"} />
              </span>
              {!isCurrentModeAvailable ? "即将开放" : stage === "analyzing" ? "分析中..." : stage === "rendering" ? "出图中..." : activeCapability.resultTitle}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
