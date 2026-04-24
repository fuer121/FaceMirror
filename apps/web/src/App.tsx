import { useEffect, useState } from "react";
import type { AnalysisResponse, ResultResponse } from "@facemirror/shared";
import { analyzePhoto, fetchResult, renderPoster } from "./api";
import { compressImage, formatRemainingTime } from "./utils";

type Stage = "idle" | "ready" | "analyzing" | "rendering" | "done" | "error";

export default function App() {
  const [stage, setStage] = useState<Stage>("idle");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<ResultResponse | null>(null);

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
        setStage("done");
      })
      .catch((error: Error) => {
        console.error(error);
        setStage("error");
      });
  }, []);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setSelectedFile(file);
    setResult(null);
    setStage("ready");
  }

  async function handleAnalyze() {
    if (!selectedFile) {
      return;
    }

    try {
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

      setStage("rendering");

      const renderResponse = await renderPoster(analyzeResponse.job_id);
      const hydrated = await fetchResult(renderResponse.job_id);
      setResult(hydrated);
      setStage("done");
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set("result", hydrated.job_id);
      window.history.replaceState({}, "", nextUrl);
    } catch (error) {
      setStage("error");
      console.error(error);
    }
  }

  return (
    <div className="page-shell">
      <div className="grain" />
      <main className="app-frame">
        <section className="hero-panel">
          <div className="hero-copy">
            <p className="eyebrow">FaceMirror / AI Beauty Reading</p>
            <h1>上传一张照片，直接生成你的妆容分析结果。</h1>
            <div className="privacy-box">
              <strong>隐私说明</strong>
              <span>24 小时后自动删除。</span>
            </div>
          </div>
        </section>

        <section className="workspace-grid">
          <article className="upload-card">
            <div className="section-head">
              <span>01</span>
              <div>
                <h2>上传照片</h2>
                <p>建议使用清晰单人照。</p>
              </div>
            </div>

            <label className="upload-dropzone">
              <input accept="image/png,image/jpeg" type="file" onChange={handleFileChange} />
              <span>选择照片</span>
              <small>支持 JPG / PNG</small>
            </label>

            <div className="tip-card">
              <strong>小提示</strong>
              <p>自然光、正脸更稳定。</p>
            </div>

            <button className="primary-button" disabled={!selectedFile || stage === "analyzing" || stage === "rendering"} onClick={handleAnalyze}>
              {stage === "analyzing" || stage === "rendering" ? "处理中..." : "开始分析"}
            </button>

            <div className="constraint-list">
              <span>单人照</span>
              <span>小于 10MB</span>
              <span>自动出结果</span>
            </div>
          </article>
        </section>

        <section className="result-grid">
          <article className="analysis-card wide">
            <div className="section-head">
              <span>02</span>
              <div>
                <h2>妆容分析结果</h2>
                <p>生成后可直接保存。</p>
              </div>
            </div>

            {result?.poster_url ? (
              <div className="poster-panel">
                <img className="poster-image" src={result.poster_url} alt="分析海报" />
                <div className="headline-block result-summary">
                  <div>
                    <small className="panel-kicker">结果</small>
                    <h3>{result.analysis_json.skinTone}</h3>
                    <p>{result.analysis_json.undertone}</p>
                  </div>
                  <div>
                    <strong className="panel-title">整体感觉</strong>
                    <p>{result.analysis_json.colorImpression}</p>
                  </div>
                </div>
                <div className="poster-actions">
                  <a className="secondary-button" href={result.poster_url} target="_blank" rel="noreferrer">
                    查看结果图
                  </a>
                  <a className="secondary-button" href={window.location.href}>
                    复制链接
                  </a>
                </div>
                <small>{formatRemainingTime(result.expires_at)}</small>
              </div>
            ) : (
              <div className="empty-block">上传后会在这里显示结果图。</div>
            )}
          </article>
        </section>
      </main>
    </div>
  );
}
