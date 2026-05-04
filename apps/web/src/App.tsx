import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import type {
  AdminRedeemCode,
  AnalyticsEventRecord,
  AnalyticsOverviewResponse,
  AnalysisMode,
  AnalysisResponse,
  CreditsResponse,
  GeneratedRedeemCode,
  PromptConfig,
  ResultResponse
} from "@facemirror/shared";
import {
  ApiError,
  analyzePhoto,
  createAdminCodes,
  disableAdminCode,
  fetchAdminAnalyticsEvents,
  fetchAdminAnalyticsOverview,
  fetchAdminCodes,
  fetchAdminPrompts,
  fetchCredits,
  fetchResult,
  redeemEntry,
  renderPoster,
  updateAdminPrompt
} from "./api";
import { compressImage } from "./utils";

type Stage = "idle" | "ready" | "analyzing" | "rendering" | "done" | "error";
type ErrorKind = "photo" | "analysis" | "render";
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

const USAGE_TOKEN_STORAGE_KEY = "facemirror_usage_token";
const ADMIN_TOKEN_STORAGE_KEY = "facemirror_admin_token";

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
    status: "当前可用",
    description: "识别脸型比例，推荐发长、刘海和卷度方向。",
    resultTitle: "生成发型建议",
    placeholder: "发型建议将在这里生成"
  },
  {
    id: "style",
    code: "STYLE",
    icon: "style",
    title: "穿搭分析",
    status: "当前可用",
    description: "结合肤色与气质，输出场景化穿搭建议。",
    resultTitle: "生成穿搭方案",
    placeholder: "穿搭方案将在这里生成"
  },
  {
    id: "makeup",
    code: "MAKEUP",
    icon: "makeup",
    title: "妆容建议",
    status: "当前可用",
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

function getStoredUsageToken() {
  return window.localStorage.getItem(USAGE_TOKEN_STORAGE_KEY);
}

function saveUsageToken(token: string) {
  window.localStorage.setItem(USAGE_TOKEN_STORAGE_KEY, token);
}

function clearUsageToken() {
  window.localStorage.removeItem(USAGE_TOKEN_STORAGE_KEY);
}

function formatCodeStatus(status: AdminRedeemCode["status"]) {
  if (status === "available") {
    return "可兑换";
  }
  if (status === "redeemed") {
    return "已兑换";
  }
  return "已禁用";
}

function formatMinuteTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const pad = (input: number) => String(input).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatFeatureTitle(feature: AnalysisMode) {
  return capabilityCards.find((card) => card.id === feature)?.title ?? feature;
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatDuration(value: number | null) {
  if (value === null) {
    return "-";
  }
  if (value < 1000) {
    return `${value}ms`;
  }
  return `${Math.round(value / 1000)}s`;
}

function formatEventType(type: AnalyticsEventRecord["event_type"]) {
  const labels: Record<AnalyticsEventRecord["event_type"], string> = {
    job_created: "创建任务",
    render_started: "开始生成",
    render_completed: "生成成功",
    render_failed: "生成失败",
    credit_refunded: "次数退回"
  };
  return labels[type];
}

function RedeemPage() {
  const [input, setInput] = useState("");
  const [adminToken, setAdminToken] = useState(() => window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) ?? "");
  const [adminView, setAdminView] = useState<"codes" | "prompts" | "analytics">("codes");
  const [codes, setCodes] = useState<AdminRedeemCode[]>([]);
  const [prompts, setPrompts] = useState<PromptConfig[]>([]);
  const [analyticsOverview, setAnalyticsOverview] = useState<AnalyticsOverviewResponse | null>(null);
  const [analyticsEvents, setAnalyticsEvents] = useState<AnalyticsEventRecord[]>([]);
  const [analyticsDays, setAnalyticsDays] = useState(7);
  const [analyticsMessage, setAnalyticsMessage] = useState("");
  const [editingFeature, setEditingFeature] = useState<AnalysisMode>("color");
  const [promptDraft, setPromptDraft] = useState("");
  const [promptMessage, setPromptMessage] = useState("");
  const [generatedCodes, setGeneratedCodes] = useState<GeneratedRedeemCode[]>([]);
  const [count, setCount] = useState(1);
  const [credits, setCredits] = useState(3);
  const [codeQuery, setCodeQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<AdminRedeemCode["status"] | "all">("all");
  const [message, setMessage] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const filteredCodes = useMemo(() => {
    const query = codeQuery.trim().toLowerCase();
    return codes.filter((code) => {
      const matchesStatus = statusFilter === "all" || code.status === statusFilter;
      const fullCode = code.code?.toLowerCase() ?? "";
      const matchesQuery = !query || code.code_preview.toLowerCase().includes(query) || fullCode.includes(query) || code.id.toLowerCase().includes(query);
      return matchesStatus && matchesQuery;
    });
  }, [codes, codeQuery, statusFilter]);

  async function refreshCodes(token = adminToken) {
    if (!token) {
      return;
    }
    const response = await fetchAdminCodes(token);
    setCodes(response.codes);
  }

  async function refreshPrompts(token = adminToken) {
    if (!token) {
      return;
    }
    const response = await fetchAdminPrompts(token);
    setPrompts(response.prompts);
  }

  async function refreshAnalytics(token = adminToken, days = analyticsDays) {
    if (!token) {
      return;
    }
    const [overview, events] = await Promise.all([
      fetchAdminAnalyticsOverview(token, days),
      fetchAdminAnalyticsEvents(token, days)
    ]);
    setAnalyticsOverview(overview);
    setAnalyticsEvents(events.events);
  }

  useEffect(() => {
    if (!adminToken) {
      return;
    }
    Promise.all([refreshCodes(adminToken), refreshPrompts(adminToken)]).catch(() => {
      window.localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
      setAdminToken("");
    });
  }, [adminToken]);

  useEffect(() => {
    const activePrompt = prompts.find((prompt) => prompt.feature === editingFeature);
    setPromptDraft(activePrompt?.prompt ?? "");
    setPromptMessage("");
  }, [editingFeature, prompts]);

  useEffect(() => {
    if (!adminToken || adminView !== "analytics") {
      return;
    }

    setAnalyticsMessage("");
    refreshAnalytics(adminToken, analyticsDays).catch((error) => {
      setAnalyticsMessage(error instanceof Error ? error.message : "数据报表加载失败。");
    });
  }, [adminToken, adminView, analyticsDays]);

  async function handleEntrySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = input.trim();
    if (!value) {
      return;
    }

    try {
      setIsBusy(true);
      setMessage("");
      const response = await redeemEntry(value);

      if (response.mode === "admin") {
        window.localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, response.admin_token);
        setAdminToken(response.admin_token);
        setMessage("已进入管理系统。");
        setInput("");
        return;
      }

      saveUsageToken(response.usage_token);
      setMessage(`兑换成功，当前设备剩余 ${response.remaining_credits} 次。`);
      setInput("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失败，请稍后重试。");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCreateCodes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!adminToken) {
      return;
    }

    try {
      setIsBusy(true);
      setMessage("");
      const response = await createAdminCodes(adminToken, { count, credits });
      setGeneratedCodes(response.codes);
      setMessage(`已生成 ${response.codes.length} 个兑换码。`);
      await refreshCodes(adminToken);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "生成失败，请稍后重试。");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDisableCode(id: string) {
    if (!adminToken) {
      return;
    }

    try {
      setIsBusy(true);
      setMessage("");
      await disableAdminCode(adminToken, id);
      await refreshCodes(adminToken);
      setMessage("兑换码已禁用。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "禁用失败，请稍后重试。");
    } finally {
      setIsBusy(false);
    }
  }

  async function copyCodeToClipboard(code: string | null) {
    if (!code) {
      setCopyMessage("历史兑换码未保存明文，无法复制完整码。");
      return;
    }

    try {
      await navigator.clipboard.writeText(code);
      setCopyMessage("兑换码已复制。");
    } catch {
      setCopyMessage("复制失败，请手动选择兑换码复制。");
    }
  }

  async function handleSavePrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!adminToken) {
      return;
    }

    try {
      setIsBusy(true);
      setMessage("");
      setPromptMessage("");
      const response = await updateAdminPrompt(adminToken, editingFeature, promptDraft);
      setPrompts((current) => current.map((prompt) => (prompt.feature === response.prompt.feature ? response.prompt : prompt)));
      await refreshPrompts(adminToken);
      setPromptMessage(`${formatFeatureTitle(editingFeature)} Prompt 已保存，下一次生成生效。`);
    } catch (error) {
      setPromptMessage(error instanceof Error ? error.message : "Prompt 保存失败，请稍后重试。");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="redeem-shell">
      <main className="redeem-card">
        <a className="redeem-back" href="/">返回首页</a>
        <p className="eyebrow redeem-eyebrow">FaceMirror / Redeem</p>
        <h1>兑换码中心</h1>
        <p>输入管理密钥进入后台；输入兑换码则为当前设备兑换生成次数。</p>

        <form className="redeem-entry" onSubmit={handleEntrySubmit}>
          <input
            autoComplete="off"
            onChange={(event) => setInput(event.target.value)}
            placeholder="输入管理密钥或兑换码"
            type="text"
            value={input}
          />
          <button disabled={isBusy || !input.trim()} type="submit">
            {isBusy ? "处理中..." : "确认"}
          </button>
        </form>

        {message ? <div className="redeem-message">{message}</div> : null}

        {adminToken ? (
          <section className="admin-panel">
            <div className="admin-panel-header">
              <div>
                <span>管理系统</span>
                <strong>{adminView === "codes" ? "兑换码生成与核销状态" : adminView === "prompts" ? "Prompt 配置" : "运营数据报表"}</strong>
              </div>
              <button
                type="button"
                onClick={() => {
                  window.localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
                  setAdminToken("");
                  setCodes([]);
                }}
              >
                退出
              </button>
            </div>

            <div className="admin-switch" role="tablist" aria-label="后台管理切换">
              <button className={adminView === "codes" ? "is-selected" : ""} onClick={() => setAdminView("codes")} type="button">
                兑换码管理
              </button>
              <button className={adminView === "prompts" ? "is-selected" : ""} onClick={() => setAdminView("prompts")} type="button">
                Prompt 管理
              </button>
              <button className={adminView === "analytics" ? "is-selected" : ""} onClick={() => setAdminView("analytics")} type="button">
                数据报表
              </button>
            </div>

            {adminView === "analytics" ? (
              <section className="analytics-panel">
                <div className="analytics-head">
                  <div>
                    <span>运营总览</span>
                    <strong>功能使用与生成消耗</strong>
                  </div>
                  <div className="range-switch" aria-label="数据范围">
                    <button className={analyticsDays === 7 ? "is-selected" : ""} onClick={() => setAnalyticsDays(7)} type="button">
                      近 7 天
                    </button>
                    <button className={analyticsDays === 30 ? "is-selected" : ""} onClick={() => setAnalyticsDays(30)} type="button">
                      近 30 天
                    </button>
                  </div>
                </div>

                {analyticsMessage ? <p className="prompt-message">{analyticsMessage}</p> : null}

                <div className="metric-grid">
                  <article>
                    <span>总生成</span>
                    <strong>{analyticsOverview?.totals.render_started ?? 0}</strong>
                  </article>
                  <article>
                    <span>成功率</span>
                    <strong>{formatPercent(analyticsOverview?.totals.success_rate ?? 0)}</strong>
                  </article>
                  <article>
                    <span>失败数</span>
                    <strong>{analyticsOverview?.totals.render_failed ?? 0}</strong>
                  </article>
                  <article>
                    <span>已消耗次数</span>
                    <strong>{analyticsOverview?.totals.credits_consumed ?? 0}</strong>
                  </article>
                </div>

                <div className="analytics-grid">
                  <section>
                    <h2>功能分布</h2>
                    <div className="analytics-list">
                      {analyticsOverview?.by_feature.length ? analyticsOverview.by_feature.map((item) => (
                        <article key={item.feature}>
                          <div>
                            <strong>{formatFeatureTitle(item.feature)}</strong>
                            <span>成功 {item.render_completed} · 失败 {item.render_failed} · 平均 {formatDuration(item.avg_duration_ms)}</span>
                          </div>
                          <b>{item.render_started}</b>
                        </article>
                      )) : <div className="code-empty">暂无功能使用数据。</div>}
                    </div>
                  </section>

                  <section>
                    <h2>每日趋势</h2>
                    <div className="trend-list">
                      {analyticsOverview?.daily.length ? analyticsOverview.daily.map((day) => (
                        <article key={day.date}>
                          <span>{day.date}</span>
                          <strong>{day.render_started}</strong>
                          <small>成功 {day.render_completed} / 失败 {day.render_failed}</small>
                        </article>
                      )) : <div className="code-empty">暂无趋势数据。</div>}
                    </div>
                  </section>
                </div>

                <section className="recent-events">
                  <h2>最近生成记录</h2>
                  <div className="event-list">
                    {analyticsEvents.length ? analyticsEvents.map((event) => (
                      <article key={event.id}>
                        <div>
                          <strong>{formatEventType(event.event_type)} · {formatFeatureTitle(event.feature)}</strong>
                          <span>{event.job_id} · {formatMinuteTime(event.created_at)}</span>
                        </div>
                        <small>{event.error_code ?? formatDuration(event.duration_ms)}</small>
                      </article>
                    )) : <div className="code-empty">暂无最近记录。</div>}
                  </div>
                </section>
              </section>
            ) : adminView === "prompts" ? (
              <section className="prompt-admin">
                <div className="prompt-admin-head">
                  <div>
                    <span>Prompt 配置</span>
                    <strong>按功能配置图生图提示词</strong>
                  </div>
                  <small>保存后下一次生成生效</small>
                </div>

                <div className="prompt-tabs" role="tablist" aria-label="Prompt 功能切换">
                  {capabilityCards.map((card) => (
                    <button
                      aria-selected={editingFeature === card.id}
                      className={editingFeature === card.id ? "is-selected" : ""}
                      key={card.id}
                      onClick={() => setEditingFeature(card.id)}
                      type="button"
                    >
                      {card.title}
                    </button>
                  ))}
                </div>

                <form className="prompt-form" onSubmit={handleSavePrompt}>
                  <textarea
                    onChange={(event) => setPromptDraft(event.target.value)}
                    placeholder="输入该功能的图生图 Prompt"
                    value={promptDraft}
                  />
                  <div>
                    <small>
                      当前 {promptDraft.trim().length} 字符
                      {prompts.find((prompt) => prompt.feature === editingFeature)?.updated_at
                        ? ` · 更新于 ${formatMinuteTime(prompts.find((prompt) => prompt.feature === editingFeature)?.updated_at ?? "")}`
                        : ""}
                    </small>
                    <button disabled={isBusy || promptDraft.trim().length < 20} type="submit">保存 Prompt</button>
                  </div>
                  {promptMessage ? <p className="prompt-message">{promptMessage}</p> : null}
                </form>
              </section>
            ) : (
              <>
                <form className="code-form" onSubmit={handleCreateCodes}>
                  <label>
                    生成数量
                    <input min={1} max={200} onChange={(event) => setCount(Number(event.target.value))} type="number" value={count} />
                  </label>
                  <label>
                    每码次数
                    <input min={1} max={10000} onChange={(event) => setCredits(Number(event.target.value))} type="number" value={credits} />
                  </label>
                  <button disabled={isBusy} type="submit">生成兑换码</button>
                </form>

                {generatedCodes.length > 0 ? (
                  <div className="generated-codes">
                    <strong>本次生成</strong>
                    <textarea readOnly value={generatedCodes.map((code) => code.code).join("\n")} />
                  </div>
                ) : null}

                <div className="code-toolbar">
                  <input
                    autoComplete="off"
                    onChange={(event) => setCodeQuery(event.target.value)}
                    placeholder="搜索兑换码或 ID"
                    type="search"
                    value={codeQuery}
                  />
                  <select onChange={(event) => setStatusFilter(event.target.value as AdminRedeemCode["status"] | "all")} value={statusFilter}>
                    <option value="all">全部状态</option>
                    <option value="available">未使用</option>
                    <option value="redeemed">已使用</option>
                    <option value="disabled">已禁用</option>
                  </select>
                </div>

                {copyMessage ? <div className="copy-message">{copyMessage}</div> : null}

                <div className="code-list">
                  {filteredCodes.map((code) => (
                    <article className="code-row" key={code.id}>
                      <div>
                        <strong>{code.code ?? code.code_preview}</strong>
                        {!code.code ? <em>历史兑换码仅保留预览，无法展示完整码</em> : null}
                        <span>{formatCodeStatus(code.status)} · 剩余 {code.remaining_credits}/{code.total_credits} 次</span>
                        <small>生成时间 {formatMinuteTime(code.created_at)}</small>
                      </div>
                      <div className="code-actions">
                        <button disabled={!code.code} onClick={() => copyCodeToClipboard(code.code)} type="button">
                          复制
                        </button>
                        <button disabled={isBusy || code.status === "disabled"} onClick={() => handleDisableCode(code.id)} type="button">
                          禁用
                        </button>
                      </div>
                    </article>
                  ))}
                  {filteredCodes.length === 0 ? <div className="code-empty">没有匹配的兑换码。</div> : null}
                </div>
              </>
            )}
          </section>
        ) : null}
      </main>
    </div>
  );
}

export default function App() {
  const isRedeemRoute = window.location.pathname === "/redeem";
  const [stage, setStage] = useState<Stage>("idle");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<ResultResponse | null>(null);
  const [visibleError, setVisibleError] = useState<VisibleError | null>(null);
  const [selectedMode, setSelectedMode] = useState<AnalysisMode>("color");
  const [usageToken, setUsageToken] = useState<string | null>(() => getStoredUsageToken());
  const [credits, setCredits] = useState<CreditsResponse | null>(null);
  const [isRedeemOpen, setIsRedeemOpen] = useState(false);
  const [redeemInput, setRedeemInput] = useState("");
  const [redeemMessage, setRedeemMessage] = useState("");
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [shouldContinueAfterRedeem, setShouldContinueAfterRedeem] = useState(false);

  const stageCopy = useMemo(() => getStageCopy(stage), [stage]);
  const previewUrl = useMemo(() => (selectedFile ? URL.createObjectURL(selectedFile) : null), [selectedFile]);
  const activeCapability = useMemo(
    () => capabilityCards.find((card) => card.id === selectedMode) ?? capabilityCards[0],
    [selectedMode]
  );

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!usageToken) {
      setCredits(null);
      return;
    }

    fetchCredits(usageToken)
      .then(setCredits)
      .catch(() => {
        clearUsageToken();
        setUsageToken(null);
        setCredits(null);
      });
  }, [usageToken]);

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
        setSelectedMode(payload.feature);
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

  function handleModeChange(mode: AnalysisMode) {
    setSelectedMode(mode);
    setResult(null);
    setVisibleError(null);
    setStage(selectedFile ? "ready" : "idle");
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.delete("result");
    window.history.replaceState({}, "", nextUrl);
  }

  async function runAnalyze(authorizedToken: string) {
    if (!selectedFile) {
      return;
    }

    let failedStage: "analyzing" | "rendering" = "analyzing";

    try {
      setVisibleError(null);
      setStage("analyzing");
      const feature = selectedMode;
      const compressed = await compressImage(selectedFile);
      const analyzeResponse: AnalysisResponse = await analyzePhoto(compressed, feature);

      setResult({
        job_id: analyzeResponse.job_id,
        feature: analyzeResponse.feature,
        analysis_status: analyzeResponse.analysis_status,
        render_status: "pending",
        image_preview_url: analyzeResponse.image_preview_url,
        poster_url: null,
        analysis_json: analyzeResponse.analysis_json,
        expires_at: analyzeResponse.expires_at
      });

      failedStage = "rendering";
      setStage("rendering");

      const renderResponse = await renderPoster(analyzeResponse.job_id, authorizedToken);
      const hydrated = await fetchResult(renderResponse.job_id);
      const nextCredits = await fetchCredits(authorizedToken).catch(() => null);
      setResult(hydrated);
      if (nextCredits) {
        setCredits(nextCredits);
      }
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

  async function handleAnalyze() {
    if (!selectedFile) {
      return;
    }

    if (!usageToken || !credits || credits.remaining_credits <= 0) {
      setShouldContinueAfterRedeem(true);
      setRedeemMessage(!usageToken ? "请先输入兑换码获取生成次数。" : "当前生成次数已用完，请兑换新的兑换码。");
      setIsRedeemOpen(true);
      return;
    }

    await runAnalyze(usageToken);
  }

  async function handleRedeemSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = redeemInput.trim();
    if (!value) {
      return;
    }

    try {
      setIsRedeeming(true);
      setRedeemMessage("");
      const response = await redeemEntry(value);

      if (response.mode === "admin") {
        window.localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, response.admin_token);
        window.location.href = "/redeem";
        return;
      }

      saveUsageToken(response.usage_token);
      setUsageToken(response.usage_token);
      setCredits({
        remaining_credits: response.remaining_credits,
        total_credits: response.total_credits
      });
      setRedeemInput("");
      setIsRedeemOpen(false);

      if (shouldContinueAfterRedeem) {
        setShouldContinueAfterRedeem(false);
        await runAnalyze(response.usage_token);
      }
    } catch (error) {
      setRedeemMessage(error instanceof Error ? error.message : "兑换失败，请稍后重试。");
    } finally {
      setIsRedeeming(false);
    }
  }

  if (isRedeemRoute) {
    return <RedeemPage />;
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
                  onClick={() => handleModeChange(card.id)}
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
            <div className={`result-canvas${stage === "analyzing" || stage === "rendering" ? " is-breathing" : ""}`}>
              <div className="theme-mark" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              {stage === "analyzing" || stage === "rendering" ? (
                <svg className="flow-lines" aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <path d="M-8 25 C 18 8, 36 10, 58 25 S 93 43, 108 22" />
                  <path d="M-10 55 C 14 35, 38 36, 60 55 S 88 76, 110 50" />
                  <path d="M-8 80 C 20 66, 39 68, 58 82 S 86 96, 108 78" />
                </svg>
              ) : null}

              {result?.poster_url && result.feature === selectedMode ? (
                <div className="poster-panel">
                  <a className="poster-link" href={result.poster_url} target="_blank" rel="noreferrer" aria-label="查看结果大图">
                    <img className="poster-image" src={result.poster_url} alt="分析海报" />
                  </a>
                </div>
              ) : stage === "error" ? (
                <div className="empty-block error-block">
                  <div>
                    <strong>{visibleError?.title ?? "处理失败"}</strong>
                    <p>{visibleError?.message ?? "请求失败，请稍后重试。"}</p>
                  </div>
                </div>
              ) : (
                <div className="result-waiting">
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
                </div>
                <label className="preview-action" aria-label="重新上传照片">
                  <input accept="image/png,image/jpeg" type="file" onChange={handleFileChange} />
                  <span aria-hidden="true">
                    <Icon name="refresh" />
                  </span>
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
              disabled={!selectedFile || stage === "analyzing" || stage === "rendering"}
              onClick={handleAnalyze}
            >
              <span aria-hidden="true">
                <Icon name={stage === "analyzing" || stage === "rendering" ? "loading" : "sparkle"} />
              </span>
              {stage === "analyzing" ? "分析中..." : stage === "rendering" ? "出图中..." : activeCapability.resultTitle}
            </button>
            <p className="credit-note">
              {credits ? `剩余 ${credits.remaining_credits} 次生成` : "输入兑换码后开始生成"}
              <button
                type="button"
                onClick={() => {
                  setShouldContinueAfterRedeem(false);
                  setRedeemMessage("");
                  setIsRedeemOpen(true);
                }}
              >
                兑换
              </button>
            </p>
            <p className="privacy-note">
              <Icon name="shield" />
              你的照片仅用于分析，24 小时后自动删除
            </p>
          </div>
        </section>
      </main>
      {isRedeemOpen ? (
        <div className="redeem-modal" role="dialog" aria-modal="true" aria-label="兑换生成次数">
          <form className="redeem-modal-card" onSubmit={handleRedeemSubmit}>
            <button className="modal-close" type="button" onClick={() => setIsRedeemOpen(false)}>
              ×
            </button>
            <strong>兑换生成次数</strong>
            <p>输入兑换码后，生成次数会绑定到当前设备。</p>
            <input
              autoComplete="off"
              onChange={(event) => setRedeemInput(event.target.value)}
              placeholder="输入兑换码"
              type="text"
              value={redeemInput}
            />
            {redeemMessage ? <small>{redeemMessage}</small> : null}
            <button disabled={isRedeeming || !redeemInput.trim()} type="submit">
              {isRedeeming ? "兑换中..." : "确认兑换"}
            </button>
            <a href="/redeem">进入兑换码中心</a>
          </form>
        </div>
      ) : null}
    </div>
  );
}
