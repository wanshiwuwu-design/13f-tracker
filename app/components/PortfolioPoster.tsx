"use client";

import { useEffect, useState } from "react";
import { posterFileName, type PosterHolding } from "@/lib/portfolio-poster";
import { renderPortfolioPoster, type PosterManager, type PosterMeta } from "@/lib/render-portfolio-poster";

type Props = { manager: PosterManager; meta: PosterMeta | null; holdings: PosterHolding[]; isLatest: boolean; hasError: boolean };
type Rendered = { key: string; url: string };

export default function PortfolioPoster({ manager, meta, holdings, isLatest, hasError }: Props) {
  const [rendered, setRendered] = useState<Rendered | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const stale = Boolean(meta?.stale || hasError);
  // A semantic render job prevents unchanged cache reads from revoking a live download.
  const key = meta ? JSON.stringify({ manager, meta: {
    quarter: meta.quarter, totalValue: meta.totalValue, count: meta.count, reportDate: meta.reportDate,
    filingDate: meta.filingDate, accession: meta.accession, checkedAt: meta.checkedAt, stale,
  }, holdings: holdings.map(({ id, ticker, company, value }) => ({ id, ticker, company, value })), isLatest, retry }) : "";

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    setError("");
    if (!key) return;
    const job = JSON.parse(key) as { manager: PosterManager; meta: PosterMeta; holdings: PosterHolding[]; isLatest: boolean };
    const canvas = document.createElement("canvas");
    void renderPortfolioPoster(canvas, job.manager, job.meta, job.holdings, job.isLatest)
      .then(() => new Promise<Blob>((resolve, reject) => {
        if (cancelled) return;
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("图片导出失败，请重试")), "image/png");
      }))
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setRendered({ key, url });
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "海报暂未生成，请重试");
      });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [key]);

  const ready = rendered?.key === key && Boolean(key);
  return (
    <section className="poster-panel" aria-labelledby="poster-heading">
      <div className="poster-copy">
        <span className="section-kicker">PORTFOLIO POSTER</span>
        <h3 id="poster-heading">把持仓，看成一张图</h3>
        <p>黑金持仓海报随当前机构和报告期自动生成。环形面积对应真实仓位，前十大持仓与申报市值一目了然。</p>
        <div className="poster-current"><span>当前海报</span><strong>{manager.name}</strong><small>{meta ? `${meta.quarter} · ${meta.count} 项持仓` : "等待持仓数据"}</small></div>
        <div className="poster-actions">
          {ready && rendered ? <a className="poster-download" href={rendered.url} download={posterFileName(manager.name, meta!.quarter)}>下载高清 PNG ↓</a> : <button className="poster-download" disabled>{error ? "生成未完成" : meta ? "正在生成海报…" : "等待数据后自动生成"}</button>}
          {ready && rendered && <a className="poster-open" href={rendered.url} target="_blank" rel="noopener noreferrer">查看大图 ↗</a>}
          {error && <button className="poster-open" onClick={() => setRetry((value) => value + 1)}>重新生成</button>}
        </div>
        <p className="poster-hint">2160 × 2880 像素 · 适合保存与分享<br />无需填写数字，新数据同步后会自动重绘。</p>
        {stale && meta && <p className="poster-warning">海报使用上次成功数据，并已在图片中标注。</p>}
        {error && <p className="poster-warning" role="alert">{error}</p>}
      </div>
      <div className="poster-preview" aria-busy={Boolean(meta && !ready && !error)}>
        {ready && rendered ? <img src={rendered.url} alt={`${manager.name} ${meta?.quarter} 13F持仓海报，含按实际占比绘制的环形图和前十大持仓`} width="1080" height="1440" /> : <div className="poster-placeholder"><span>13F</span><strong>{error ? "暂未生成海报" : meta ? "正在绘制持仓海报" : "数据同步后自动生成"}</strong><small>{error ? "请点击重新生成" : "金额与占比来自 SEC 申报"}</small></div>}
      </div>
    </section>
  );
}
