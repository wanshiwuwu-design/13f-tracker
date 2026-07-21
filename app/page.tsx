"use client";

import { useEffect, useMemo, useState } from "react";

type Holding = {
  rank: number;
  ticker: string;
  company: string;
  sector: string;
  value: number;
  weight: number;
  shares: string;
  change: number;
  action: "增持" | "减持" | "新建" | "清仓" | "持有";
  color: string;
};

const holdings: Holding[] = [
  { rank: 1, ticker: "AAPL", company: "Apple Inc.", sector: "信息技术", value: 57.84, weight: 21.98, shares: "228.1M", change: -6.2, action: "减持", color: "#9ca3af" },
  { rank: 2, ticker: "AXP", company: "American Express", sector: "金融", value: 45.86, weight: 17.43, shares: "151.6M", change: 0, action: "持有", color: "#3b82f6" },
  { rank: 3, ticker: "KO", company: "Coca-Cola", sector: "日常消费", value: 30.42, weight: 11.56, shares: "400.0M", change: 0, action: "持有", color: "#ef4444" },
  { rank: 4, ticker: "BAC", company: "Bank of America", sector: "金融", value: 25.04, weight: 9.51, shares: "513.7M", change: -4.8, action: "减持", color: "#dc2626" },
  { rank: 5, ticker: "CVX", company: "Chevron", sector: "能源", value: 17.46, weight: 6.63, shares: "84.4M", change: 2.3, action: "增持", color: "#2563eb" },
  { rank: 6, ticker: "OXY", company: "Occidental Petroleum", sector: "能源", value: 17.22, weight: 6.54, shares: "264.9M", change: 0, action: "持有", color: "#111827" },
  { rank: 7, ticker: "GOOGL", company: "Alphabet", sector: "通信服务", value: 16.63, weight: 6.32, shares: "57.8M", change: 18.4, action: "增持", color: "#f59e0b" },
  { rank: 8, ticker: "CB", company: "Chubb", sector: "金融", value: 11.16, weight: 4.24, shares: "34.2M", change: 0, action: "持有", color: "#16a34a" },
  { rank: 9, ticker: "MCO", company: "Moody's", sector: "金融", value: 10.76, weight: 4.09, shares: "24.7M", change: 0, action: "持有", color: "#0f766e" },
  { rank: 10, ticker: "KHC", company: "Kraft Heinz", sector: "日常消费", value: 7.32, weight: 2.78, shares: "325.6M", change: -9.1, action: "减持", color: "#f97316" },
  { rank: 11, ticker: "DVA", company: "DaVita", sector: "医疗保健", value: 4.63, weight: 1.76, shares: "30.1M", change: 1.1, action: "增持", color: "#8b5cf6" },
  { rank: 12, ticker: "KR", company: "Kroger", sector: "日常消费", value: 3.62, weight: 1.38, shares: "50.0M", change: -3.4, action: "减持", color: "#1d4ed8" },
];

const managers = [
  { name: "伯克希尔·哈撒韦", manager: "Warren Buffett", cik: "0001067983", value: "$263.1B", holdings: 26, initials: "BH" },
  { name: "桥水基金", manager: "Ray Dalio", cik: "0001350694", value: "$21.8B", holdings: 745, initials: "BW" },
  { name: "潘兴广场", manager: "Bill Ackman", cik: "0001336528", value: "$14.6B", holdings: 11, initials: "PS" },
  { name: "喜马拉雅资本", manager: "Li Lu", cik: "0001709323", value: "$3.1B", holdings: 8, initials: "HC" },
  { name: "Scion Asset", manager: "Michael Burry", cik: "0001649339", value: "$0.9B", holdings: 13, initials: "SA" },
];

const quarters = ["2026 Q1", "2025 Q4", "2025 Q3", "2025 Q2", "2025 Q1"];

type DataMeta = {
  totalValue: number;
  count: number;
  filingDate: string;
  reportDate: string;
  sourceUrl: string;
  removed: number;
};

export default function Home() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [activeManager, setActiveManager] = useState(managers[0]);
  const [quarter, setQuarter] = useState(quarters[0]);
  const [filter, setFilter] = useState("全部");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Holding | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [activeHoldings, setActiveHoldings] = useState<Holding[]>(holdings);
  const [dataMeta, setDataMeta] = useState<DataMeta | null>({ totalValue: 263.1, count: 26, filingDate: "2026-05-15", reportDate: "2026-03-31", sourceUrl: "https://www.sec.gov/Archives/edgar/data/1067983/000119312526226661/0001193125-26-226661-index.htm", removed: 0 });
  const [loading, setLoading] = useState(false);
  const [dataError, setDataError] = useState("");

  useEffect(() => {
    const saved = window.localStorage.getItem("13f-theme");
    const preferred = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    const nextTheme = saved === "light" || saved === "dark" ? saved : preferred;
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem("13f-theme", nextTheme);
  };

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setDataError("");
    setSelected(null);
    fetch(`/api/sec13f?cik=${activeManager.cik}&quarter=${encodeURIComponent(quarter)}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as { holdings?: Holding[]; meta?: DataMeta; error?: string };
        if (!response.ok || !data.holdings || !data.meta) throw new Error(data.error ?? "SEC 数据暂时不可用");
        setActiveHoldings(data.holdings);
        setDataMeta(data.meta);
      })
      .catch((error) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setDataError(error instanceof Error ? error.message : "SEC 数据暂时不可用");
        setActiveHoldings(activeManager.cik === managers[0].cik && quarter === quarters[0] ? holdings : []);
        if (activeManager.cik !== managers[0].cik || quarter !== quarters[0]) setDataMeta(null);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [activeManager, quarter]);

  const visibleHoldings = useMemo(() => {
    if (filter === "全部") return activeHoldings;
    return activeHoldings.filter((item) => item.action === filter);
  }, [filter, activeHoldings]);

  const sectorData = useMemo(() => {
    const palette: Record<string, string> = { 金融: "#34d399", 信息技术: "#60a5fa", 日常消费: "#fbbf24", 能源: "#fb7185", 通信服务: "#a78bfa", 医疗保健: "#22d3ee", 可选消费: "#f97316", 工业: "#94a3b8", 其他: "#64748b" };
    const grouped = new Map<string, number>();
    activeHoldings.forEach((item) => grouped.set(item.sector, (grouped.get(item.sector) ?? 0) + item.weight));
    return [...grouped.entries()].map(([name, value]) => ({ name, value, color: palette[name] ?? "#64748b" })).sort((a, b) => b.value - a.value);
  }, [activeHoldings]);

  const donutBackground = useMemo(() => {
    let cursor = 0;
    const parts = sectorData.map((item) => {
      const start = cursor;
      cursor += item.value;
      return `${item.color} ${start.toFixed(1)}% ${Math.min(100, cursor).toFixed(1)}%`;
    });
    return parts.length ? `conic-gradient(${parts.join(",")})` : "#1b2833";
  }, [sectorData]);

  const topTen = activeHoldings.slice(0, 10).reduce((sum, item) => sum + item.weight, 0);
  const turnover = activeHoldings.reduce((sum, item) => sum + item.weight * Math.min(100, Math.abs(item.change)) / 100, 0) / 2;
  const filingDate = dataMeta?.filingDate ? dataMeta.filingDate.replaceAll("-", ".") : "—";

  const managerMatches = managers.filter((item) =>
    `${item.name}${item.manager}`.toLowerCase().includes(query.toLowerCase()),
  );

  const chooseManager = (manager: (typeof managers)[number]) => {
    setActiveManager(manager);
    setFilter("全部");
    setQuery("");
    setShowSearch(false);
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="13F Tracker 首页">
          <span className="brand-mark"><i /><i /><i /></span>
          <span>13F <b>TRACKER</b></span>
        </a>
        <nav className="nav-links" aria-label="主导航">
          <a className="active" href="#dashboard">机构持仓</a>
          <a href="#moves">调仓动态</a>
          <a href="#managers">投资人</a>
        </nav>
        <div className="header-actions">
          <span className="source-badge"><i /> SEC EDGAR</span>
          <button
            className="theme-toggle"
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
            title={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
          >
            <span className="theme-icon" aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
            <span className="theme-label">{theme === "dark" ? "浅色" : "深色"}</span>
          </button>
          <button className="icon-button" aria-label="打开搜索" onClick={() => setShowSearch(!showSearch)}>⌕</button>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-glow" />
        <div className="eyebrow"><span /> SMART MONEY, MADE VISIBLE</div>
        <h1>看懂顶级机构的<br /><em>每一次下注</em></h1>
        <p>追踪全球知名投资机构的 13F 持仓变化，从公开披露中识别长期资本的真实选择。</p>
        <div className="search-wrap">
          <span className="search-icon">⌕</span>
          <input
            value={query}
            onChange={(event) => { setQuery(event.target.value); setShowSearch(true); }}
            onFocus={() => setShowSearch(true)}
            placeholder="搜索机构或投资人，例如 Buffett、桥水…"
            aria-label="搜索机构或投资人"
          />
          <kbd>⌘ K</kbd>
          {showSearch && (
            <div className="search-results">
              <div className="search-label">机构与投资人</div>
              {managerMatches.map((item) => (
                <button key={item.cik} onClick={() => chooseManager(item)}>
                  <span className="avatar small">{item.initials}</span>
                  <span><b>{item.name}</b><small>{item.manager}</small></span>
                  <span className="result-value">SEC 实时</span>
                </button>
              ))}
              {managerMatches.length === 0 && <p className="no-result">未找到匹配机构</p>}
            </div>
          )}
        </div>
        <div className="quick-list">
          <span>热门：</span>
          {managers.slice(0, 4).map((item) => <button key={item.cik} onClick={() => chooseManager(item)}>{item.manager}</button>)}
        </div>
      </section>

      <section className="dashboard" id="dashboard">
        <div className="section-heading">
          <div className="manager-title">
            <span className="avatar">{activeManager.initials}</span>
            <div>
              <div className="section-kicker">CURRENT PORTFOLIO</div>
              <h2>{activeManager.name}</h2>
              <p>{activeManager.manager} · CIK {activeManager.cik}</p>
            </div>
          </div>
          <div className="period-control">
            <label htmlFor="quarter">报告期</label>
            <select id="quarter" value={quarter} onChange={(event) => setQuarter(event.target.value)}>
              {quarters.map((item) => <option key={item}>{item}</option>)}
            </select>
            <span className="filed-date">披露于 {filingDate}</span>
          </div>
        </div>

        <div className="metric-grid">
          <article className="metric-card featured">
            <div className="metric-label">13F 持仓市值 <span>i</span></div>
            <strong>{dataMeta ? `$${dataMeta.totalValue.toFixed(1)}B` : "—"}</strong>
            <div className="metric-foot"><span className={dataError ? "down" : "positive"}>{loading ? "正在同步" : dataError ? "使用备用数据" : "SEC 已同步"}</span><small>{quarter}</small></div>
            <div className="sparkline" aria-hidden="true"><span /><span /><span /><span /><span /><span /><span /></div>
          </article>
          <article className="metric-card">
            <div className="metric-label">持仓数量</div>
            <strong>{dataMeta?.count ?? "—"}</strong>
            <div className="metric-foot"><span className="neutral">{dataMeta ? `清仓 ${dataMeta.removed}` : "—"}</span><small>较上季度</small></div>
          </article>
          <article className="metric-card">
            <div className="metric-label">前十集中度</div>
            <strong>{activeHoldings.length ? `${topTen.toFixed(1)}%` : "—"}</strong>
            <div className="progress"><span style={{ width: `${Math.min(100, topTen)}%` }} /></div>
            <div className="metric-foot"><small>高度集中</small></div>
          </article>
          <article className="metric-card">
            <div className="metric-label">本季换手率</div>
            <strong>{activeHoldings.length ? `${turnover.toFixed(1)}%` : "—"}</strong>
            <div className="metric-foot"><span className="positive">估算值</span><small>按申报股数变化</small></div>
          </article>
        </div>

        <div className="insight-grid">
          <article className="panel top-holdings">
            <div className="panel-head"><div><span className="section-kicker">CONCENTRATION</span><h3>核心持仓</h3></div><span className="panel-note">占组合权重</span></div>
            <div className="bar-list">
              {activeHoldings.slice(0, 6).map((item) => (
                <button key={item.ticker} onClick={() => setSelected(item)} className="bar-row">
                  <span className="rank">{String(item.rank).padStart(2, "0")}</span>
                  <span className="stock-logo" style={{ background: item.color }}>{item.ticker.slice(0, 1)}</span>
                  <span className="bar-company"><b>{item.ticker}</b><small>{item.company}</small></span>
                  <span className="bar-track"><i style={{ width: `${Math.min(100, item.weight * 4)}%` }} /></span>
                  <strong>{item.weight.toFixed(2)}%</strong>
                </button>
              ))}
            </div>
          </article>

          <article className="panel allocation">
            <div className="panel-head"><div><span className="section-kicker">ALLOCATION</span><h3>行业分布</h3></div></div>
            <div className="donut-wrap">
              <div className="donut" style={{ background: donutBackground }}><div><strong>{sectorData.length}</strong><span>行业</span></div></div>
              <div className="legend">
                {sectorData.slice(0, 6).map((item) => <div key={item.name}><span><i style={{ background: item.color }} />{item.name}</span><b>{item.value.toFixed(1)}%</b></div>)}
              </div>
            </div>
            <div className="allocation-note"><span>最大行业</span><b>{sectorData[0] ? `${sectorData[0].name} · ${sectorData[0].value.toFixed(1)}%` : "等待数据"}</b></div>
          </article>
        </div>
      </section>

      <section className="moves-section" id="moves">
        <div className="section-heading compact">
          <div><span className="section-kicker">QUARTERLY MOVES</span><h2>本季度调仓明细</h2><p>点击任一持仓，查看仓位、持股数量与变化趋势。</p></div>
          <div className="filter-tabs" role="tablist">
            {["全部", "增持", "减持", "新建", "清仓"].map((item) => <button role="tab" aria-selected={filter === item} key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}</button>)}
          </div>
        </div>
        <div className="table-card">
          <div className="holdings-table table-head"><span># / 股票</span><span>行业</span><span>持股数量</span><span>持仓市值</span><span>组合占比</span><span>季度变化</span></div>
          {visibleHoldings.map((item) => (
            <button className="holdings-table table-row" key={item.ticker} onClick={() => setSelected(item)}>
              <span className="stock-cell"><i>{item.rank}</i><span className="stock-logo" style={{ background: item.color }}>{item.ticker[0]}</span><span><b>{item.ticker}</b><small>{item.company}</small></span></span>
              <span>{item.sector}</span><span>{item.shares}</span><span><b>${item.value.toFixed(2)}B</b></span><span><b>{item.weight.toFixed(2)}%</b></span>
              <span><i className={`action ${item.action}`}>{item.action}</i><b className={item.change > 0 ? "up" : item.change < 0 ? "down" : "flat"}>{item.change === 0 ? "—" : `${item.change > 0 ? "+" : ""}${item.change}%`}</b></span>
            </button>
          ))}
          {loading && <div className="table-status"><span className="loader" />正在从 SEC EDGAR 同步申报数据…</div>}
          {!loading && visibleHoldings.length === 0 && <div className="table-status">{dataError || "该筛选条件下暂无持仓"}</div>}
        </div>
        <p className="data-caption">数据直接读取 SEC Form 13F 信息表，并按 CUSIP 合并同一证券；季度变化按申报股数与上一季自动对比。13F 不包含现金、私募资产及多数海外直接持仓。</p>
      </section>

      <section className="managers-section" id="managers">
        <div className="section-heading compact"><div><span className="section-kicker">FOLLOW THE BEST</span><h2>追踪更多顶级投资人</h2></div><button className="text-button">查看全部机构 →</button></div>
        <div className="manager-grid">
          {managers.map((item) => (
            <button className={activeManager.cik === item.cik ? "manager-card active" : "manager-card"} key={item.cik} onClick={() => chooseManager(item)}>
              <span className="avatar">{item.initials}</span><span><b>{item.name}</b><small>{item.manager}</small></span><span className="manager-stat"><b>{item.value}</b><small>{item.holdings} 项持仓</small></span>
            </button>
          ))}
        </div>
      </section>

      <footer><div className="brand"><span className="brand-mark"><i /><i /><i /></span><span>13F <b>TRACKER</b></span></div><p>数据源自美国证券交易委员会公开披露，仅供研究，不构成投资建议。</p><a href="https://www.sec.gov/edgar/search/" target="_blank" rel="noreferrer">SEC EDGAR ↗</a></footer>

      {selected && (
        <div className="drawer-backdrop" onClick={() => setSelected(null)}>
          <aside className="drawer" onClick={(event) => event.stopPropagation()} aria-label={`${selected.company} 持仓详情`}>
            <button className="drawer-close" onClick={() => setSelected(null)} aria-label="关闭详情">×</button>
            <div className="drawer-stock"><span className="stock-logo large" style={{ background: selected.color }}>{selected.ticker[0]}</span><div><span className="section-kicker">POSITION DETAIL</span><h2>{selected.ticker}</h2><p>{selected.company} · {selected.sector}</p></div></div>
            <div className="drawer-metrics"><div><span>持仓市值</span><b>${selected.value.toFixed(2)}B</b></div><div><span>组合占比</span><b>{selected.weight.toFixed(2)}%</b></div><div><span>持股数量</span><b>{selected.shares}</b></div><div><span>本季动作</span><b className={selected.change >= 0 ? "up" : "down"}>{selected.action}</b></div></div>
            <div className="history-card"><div className="panel-head"><h3>持仓权重趋势</h3><span>近 5 季</span></div><div className="history-bars">{[62, 68, 84, 76, 71].map((height, index) => <div key={index}><i style={{ height: `${height}%` }} /><span>{quarters[4 - index].replace("20", "'")}</span></div>)}</div></div>
            <div className="filing-link"><span>最新申报</span><div><b>Form 13F-HR · {quarter}</b><small>{dataMeta?.filingDate ?? "—"} 提交</small></div>{dataMeta?.sourceUrl && <a href={dataMeta.sourceUrl} target="_blank" rel="noreferrer">查看原文 ↗</a>}</div>
          </aside>
        </div>
      )}
    </main>
  );
}
