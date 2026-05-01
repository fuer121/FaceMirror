import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import type { AnalysisResponse, ResultResponse } from "@facemirror/shared";
import { ApiError, analyzePhoto, fetchResult, renderPoster } from "./api";
import { compressImage } from "./utils";

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
          <path d="M12 3.8c-4.8 0-8.4 3.2-8.4 7.7 0 4.9 3.8 8.7 8.8 8.7h1.1c1.2 0 1.8-1.4 1-2.3-.5-.6-.2-1.5.6-1.7l1.9-.4c2.1-.5 3.4-2.2 3.4-4.3 0-4.5-3.6-7.7-8.4-7.7Z" stroke="currentColor" strokeWidth="1.7" />
          <circle cx="8.4" cy="10.2" r="1.1" fill="currentColor" opacity="0.7" />
          <circle cx="11.5" cy="7.7" r="1.1" fill="currentColor" opacity="0.5" />
          <circle cx="15.4" cy="9.5" r="1.1" fill="currentColor" opacity="0.42" />
          <circle cx="10.6" cy="14" r="1.1" fill="currentColor" opacity="0.6" />
        </svg>
      );
    case "hair":
      return (
        <svg aria-hidden="true" className={classNames} fill="none" viewBox="0 0 24 24">
          <path d="M6.4 19.5c1.1-2.1 1.2-4.1.6-6.1-.9-3 .3-7.4 5.1-7.4s6 4.4 5.1 7.4c-.6 2-.5 4 .6 6.1" stroke="currentColor" strokeLinecap="round" strokeWidth="1.65" />
          <path d="M8.8 11.7c2.2-.4 4-1.6 5.1-3.6 1 1.8 1.9 2.7 3.2 3.3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.65" />
          <path d="M9.2 15.4c1.8 1.7 3.9 1.8 5.8 0" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
          <path d="M5 20.2c1.6-1.2 3.5-1.9 5.4-2.1M19 20.2c-1.5-1.2-3.4-1.9-5.4-2.1" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" opacity="0.75" />
        </svg>
      );
    case "style":
      return (
        <svg aria-hidden="true" className={classNames} fill="none" viewBox="0 0 24 24">
          <path d="M10 4.8h4l.8 3 2.2 2.7-1.8 8.7H8.8L7 10.5l2.2-2.7z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
          <path d="M10 4.8c.2 1.4.8 2.3 2 2.3s1.8-.9 2-2.3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
          <path d="M8.2 13.2h7.6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" opacity="0.55" />
        </svg>
      );
    case "makeup":
      return (
        <svg aria-hidden="true" className={classNames} fill="none" viewBox="0 0 24 24">
          <path d="M6.5 18.8 12.8 8.6l2.6 1.6-6.3 10.2z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.55" />
          <path d="m12.8 8.6 1.4-3.9 2.7 1.7-1.5 3.8" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.55" />
          <path d="M14.8 18.6 18 9.7l1.9.7-3.2 8.9z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.45" />
          <path d="m18 9.7.6-2.7 1.6.6-.3 2.8" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.45" />
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
        description: "点击结果图可查看大图并保存。"
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
            <div className="hero-copy">
              <h1>你的个人美学分析</h1>
              <p>AI 智能分析，发现更美的你</p>
            </div>
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
                  <a className="poster-link" href={result.poster_url} target="_blank" rel="noreferrer" aria-label="查看结果大图">
                    <img className="poster-image" src={result.poster_url} alt="分析海报" />
                  </a>
                </div>
              ) : stage === "error" && selectedMode === "color" ? (
                <div className="empty-block error-block">
                  <div>
                    <strong>{visibleError?.title ?? "处理失败"}</strong>
                    <p>{visibleError?.message ?? "请求失败，请稍后重试。"}</p>
                  </div>
                </div>
              ) : !isCurrentModeAvailable ? (
                <div className="upcoming-message">敬请期待</div>
              ) : (
                <div className="empty-block">
                  <span className="empty-icon" aria-hidden="true">
                    <Icon name="sparkle" />
                  </span>
                  <strong>生成结果</strong>
                  <p>AI 分析将显示在这里</p>
                </div>
              )}
            </div>

            {previewUrl ? (
              <div className="selected-preview">
                <label className="preview-thumb" aria-label="重新上传照片">
                  <input accept="image/png,image/jpeg" type="file" onChange={handleFileChange} />
                  <img src={previewUrl} alt="已选择照片预览" />
                </label>
                <div className="preview-copy">
                  <strong>已上传照片</strong>
                  <span>单人正脸 · 自然光 · 小于 10MB</span>
                  <small>{selectedFile?.name}</small>
                </div>
                <label className="preview-action" aria-label="重新上传照片">
                  <input accept="image/png,image/jpeg" type="file" onChange={handleFileChange} />
                  <span aria-hidden="true">换</span>
                  <small>更换照片</small>
                </label>
              </div>
            ) : (
              <div className="upload-controls">
                <label className="upload-pill">
                  <input accept="image/png,image/jpeg" type="file" onChange={handleFileChange} />
                  <span className="upload-symbol" aria-hidden="true" />
                  <span className="upload-copy">
                    <strong>上传照片</strong>
                    <small>单人正脸 · 自然光 · 小于 10MB</small>
                  </span>
                  <span className="upload-action">选择照片</span>
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
            <p className="privacy-note">
              <Icon name="shield" />
              你的照片仅用于分析，24 小时后自动删除
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
