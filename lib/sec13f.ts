const tickerByCusip: Record<string, string> = {
  "037833100": "AAPL", "025816109": "AXP", "191216100": "KO",
  "060505104": "BAC", "166764100": "CVX", "674599105": "OXY",
  "02079K305": "GOOGL", "02079K107": "GOOG", "H1467J104": "CB",
  "615369105": "MCO", "500754106": "KHC", "23918K108": "DVA",
  "501044101": "KR", "02005N100": "ALLY", "14040H105": "COF",
  "670346105": "NUE", "650111107": "NYT", "92343E102": "VRSN",
  "829933100": "SIRI", "247361702": "DAL", "526057104": "LEN",
  "91324P102": "UNH", "38141G104": "GS", "084670702": "BRK.B",
  "594918104": "MSFT", "67066G104": "NVDA", "30303M102": "META",
  "88160R101": "TSLA", "023135106": "AMZN", "46625H100": "JPM",
  "742718109": "PG", "92826C839": "V", "20030N101": "CMCSA",
  "254687106": "DIS", "438516106": "HON", "17275R102": "CSCO",
  "713448108": "PEP", "478160104": "JNJ", "931142103": "WMT",
  "580135101": "MCD", "70450Y103": "PYPL", "125523100": "CI",
};

const sectorByTicker: Record<string, string> = {
  AAPL:"信息技术", MSFT:"信息技术", NVDA:"信息技术", GOOGL:"通信服务", GOOG:"通信服务", META:"通信服务",
  AXP:"金融", BAC:"金融", JPM:"金融", GS:"金融", V:"金融", COF:"金融", CB:"金融", MCO:"金融", ALLY:"金融", "BRK.B":"金融",
  KO:"日常消费", KHC:"日常消费", KR:"日常消费", PG:"日常消费", PEP:"日常消费", WMT:"日常消费",
  CVX:"能源", OXY:"能源", DVA:"医疗保健", UNH:"医疗保健", JNJ:"医疗保健", CI:"医疗保健",
  AMZN:"可选消费", TSLA:"可选消费", MCD:"可选消费", DIS:"通信服务", CMCSA:"通信服务", CSCO:"信息技术", HON:"工业", DAL:"工业",
};

const colors = ["#35e6a3", "#60a5fa", "#fbbf24", "#fb7185", "#a78bfa", "#22d3ee", "#f97316", "#94a3b8"];

export const MANAGER_CIKS = [
  "0001067983", "0001350694", "0001336528", "0001709323", "0001649339",
  "0001759760", "0001697748", "0001569205", "0001112520", "0001536411",
  "0001656456", "0001103804", "0001167483", "0001647251",
];
export const REFRESH_INTERVAL_MS = 60 * 60 * 1000;
const HEADERS = {
  "User-Agent": "13FTracker/1.0 research@13ftracker.app",
  Accept: "application/json, application/xml, text/xml, */*",
};
const RESPONSE_HEADERS = { "Cache-Control": "no-store" };

export interface CacheStore {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
}
export interface Database {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      first<T>(): Promise<T | null>;
      run(): Promise<unknown>;
    };
  };
}
export class D1Cache implements CacheStore {
  private db: Database;
  constructor(db: Database) { this.db = db; }
  async get<T>(key: string): Promise<T | null> {
    const row = await this.db.prepare("SELECT payload FROM sec13f_cache WHERE cache_key = ?")
      .bind(key).first<{ payload: string }>();
    return row ? JSON.parse(row.payload) as T : null;
  }
  async set(key: string, value: unknown) {
    await this.db.prepare("INSERT INTO sec13f_cache (cache_key, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at")
      .bind(key, JSON.stringify(value), new Date().toISOString()).run();
  }
}
type Filing = { accession: string; reportDate: string; filingDate: string; form: string; primary: string; accepted: string };
type Recent = Record<"form" | "accessionNumber" | "reportDate" | "filingDate", string[]> & { primaryDocument?: string[]; acceptanceDateTime?: string[] };
type Position = { id: string; company: string; cusip: string; title: string; putCall: string; value: number; shares: number };
type Table = { holdings: Position[]; amendmentType: string; sourceUrl: string };
type Portfolio = { holdings: Position[]; filing: Filing; sourceUrl: string; accessions: string[] };
type Snapshot = {
  holdings: Array<{ id: string; rank: number; ticker: string; company: string; sector: string; value: number; weight: number; shares: string; change: number | null; action: string; color: string }>;
  availableQuarters: string[];
  meta: { quarter: string; totalValue: number; count: number; filingDate: string; reportDate: string; sourceUrl: string; removed: number; checkedAt: string; stale: boolean; comparisonAvailable: boolean; accession: string; accessions: string[]; warning?: string };
};
type Failure = { error: string | null; failedAt: string };
const inFlight = new Map<string, Promise<Snapshot>>();

function decode(value: string) {
  return value.replace(/&(?:amp|lt|gt|quot|apos|#39);/g, (entity) => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&#39;": "'" })[entity] ?? entity)
    .replace(/&#(x[\da-f]+|\d+);/gi, (_, code: string) => String.fromCodePoint(code[0].toLowerCase() === "x" ? parseInt(code.slice(1), 16) : Number(code))).trim();
}
function tag(block: string, name: string) {
  const match = block.match(new RegExp(`<(?:[\\w-]+:)?${name}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${name}>`, "i"));
  return match ? decode(match[1].replace(/<[^>]+>/g, "")) : "";
}
function quarterEnd(quarter: string) {
  const match = quarter.match(/^(\d{4}) Q([1-4])$/);
  return match ? `${match[1]}-${["03-31", "06-30", "09-30", "12-31"][Number(match[2]) - 1]}` : null;
}
function quarterFromDate(date: string) {
  const month = ["03-31", "06-30", "09-30", "12-31"].indexOf(date.slice(5));
  return month >= 0 ? `${date.slice(0, 4)} Q${month + 1}` : null;
}
function previousQuarter(quarter: string) {
  const year = Number(quarter.slice(0, 4));
  const q = Number(quarter.slice(-1));
  return q === 1 ? `${year - 1} Q4` : `${year} Q${q - 1}`;
}
function sleep(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function secText(url: string) {
  // Keep each update sequential and below SEC's ten-requests-per-second limit.
  for (let attempt = 0; attempt < 3; attempt++) {
    await sleep(attempt === 0 ? 120 : 500 * 2 ** attempt);
    try {
      const response = await fetch(url, { headers: HEADERS, cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (!response.ok) {
        if ((response.status === 429 || response.status >= 500) && attempt < 2) {
          await response.body?.cancel();
          continue;
        }
        throw new Error(`SEC request failed (${response.status})`);
      }
      return await response.text();
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("SEC request failed")) throw error;
      if (attempt === 2) throw new Error("SEC request timed out or network unavailable", { cause: error });
    }
  }
  throw new Error("SEC unavailable");
}
async function secJson(url: string) { return JSON.parse(await secText(url)); }
function extractFilings(recent: Recent): Filing[] {
  return recent.form.flatMap((form, i) => (form === "13F-HR" || form === "13F-HR/A") && quarterFromDate(recent.reportDate[i]) ? [{
    form, accession: recent.accessionNumber[i], reportDate: recent.reportDate[i], filingDate: recent.filingDate[i],
    primary: (recent.primaryDocument?.[i] ?? "primary_doc.xml").split("/").pop()!,
    accepted: recent.acceptanceDateTime?.[i] ?? `${recent.filingDate[i]}:${recent.accessionNumber[i]}`,
  }] : []);
}
async function filingsFor(cik: string, requestedQuarter: string | null) {
  const submission = await secJson(`https://data.sec.gov/submissions/CIK${cik}.json`);
  const filings = extractFilings(submission.filings.recent);
  const archives = (submission.filings.files ?? []) as Array<{ name: string; filingTo: string }>;
  // Busy filers may have fewer than two quarters in the recent window.
  for (const archive of archives.slice(0, 5)) {
    const newest = [...filings].sort((a, b) => b.reportDate.localeCompare(a.reportDate))[0];
    const target = requestedQuarter ?? (newest && quarterFromDate(newest.reportDate));
    const previous = target && quarterEnd(previousQuarter(target));
    if (target && filings.some((f) => f.reportDate === quarterEnd(target)) && filings.some((f) => f.reportDate === previous) && archive.filingTo < previous!) break;
    if (!/^CIK\d+-submissions-\d+\.json$/.test(archive.name)) throw new Error("Invalid SEC submissions archive");
    filings.push(...extractFilings(await secJson(`https://data.sec.gov/submissions/${archive.name}`)));
  }
  return [...new Map(filings.map((f) => [f.accession, f])).values()]
    .sort((a, b) => b.reportDate.localeCompare(a.reportDate) || b.accepted.localeCompare(a.accepted));
}
function aggregate(positions: Position[]) {
  const result = new Map<string, Position>();
  for (const position of positions) {
    const old = result.get(position.id);
    result.set(position.id, old ? { ...old, value: old.value + position.value, shares: old.shares + position.shares } : { ...position });
  }
  return [...result.values()];
}
async function loadTable(cik: string, filing: Filing, cache?: CacheStore): Promise<Table> {
  const key = `table-v2:${cik}:${filing.accession}`;
  const saved = await cache?.get<Table>(key);
  if (saved) return saved;
  const base = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${filing.accession.replaceAll("-", "")}`;
  const index = await secJson(`${base}/index.json`);
  const names = ((index.directory?.item ?? []) as Array<{ name: string }>).map((item) => item.name)
    .filter((name) => /^[\w.-]+\.xml$/i.test(name));
  if (!names.length || names.length > 16) throw new Error("SEC information table files unavailable");
  names.sort((a, b) => Number(b === filing.primary) - Number(a === filing.primary));
  let cover = "";
  let tables = 0;
  const positions: Position[] = [];
  let entries = 0;
  for (const name of names) {
    const xml = await secText(`${base}/${name}`);
    if (/<(?:[\w-]+:)?edgarSubmission\b/i.test(xml)) { cover = xml; continue; }
    if (!/<(?:[\w-]+:)?informationTable\b/i.test(xml)) continue;
    if (!/<\/(?:[\w-]+:)?informationTable\s*>/i.test(xml)) throw new Error("SEC information table is incomplete");
    tables++;
    const blocks = xml.match(/<(?:[\w-]+:)?infoTable\b[\s\S]*?<\/(?:[\w-]+:)?infoTable>/gi) ?? [];
    for (const block of blocks) {
      const cusip = tag(block, "cusip");
      const company = tag(block, "nameOfIssuer");
      const title = tag(block, "titleOfClass");
      const putCall = tag(block, "putCall");
      const shareType = tag(block, "sshPrnamtType");
      const valueText = tag(block, "value").replaceAll(",", "");
      const sharesText = tag(block, "sshPrnamt").replaceAll(",", "");
      if (!/^[\dA-Z]{9}$/i.test(cusip) || !company || !/^\d+(\.\d+)?$/.test(valueText) || !/^\d+(\.\d+)?$/.test(sharesText)) throw new Error("SEC information table contains invalid holdings");
      // Form 13F switched from thousands of dollars to dollars on 2023-01-03.
      const value = Number(valueText) * (filing.filingDate < "2023-01-03" ? 1000 : 1);
      const shares = Number(sharesText);
      if (!Number.isFinite(value) || !Number.isFinite(shares)) throw new Error("Invalid SEC numeric value");
      positions.push({ id: [cusip, title, putCall, shareType].join(":"), company, title, putCall, cusip, value, shares });
      entries++;
    }
  }
  const expected = tag(cover, "tableEntryTotal");
  if ((!tables && expected !== "0") || (!entries && expected !== "0") || (expected !== "" && Number(expected) !== entries)) throw new Error("SEC information table missing or entry count mismatch");
  const result = { holdings: aggregate(positions), amendmentType: tag(cover, "amendmentType").toUpperCase(), sourceUrl: `${base}/${filing.accession}-index.html` };
  await cache?.set(key, result);
  return result;
}
async function portfolioFor(cik: string, filings: Filing[], quarter: string, cache?: CacheStore): Promise<Portfolio | null> {
  const period = filings.filter((f) => f.reportDate === quarterEnd(quarter)).sort((a, b) => a.accepted.localeCompare(b.accepted));
  if (!period.length) return null;
  // A restatement is a complete replacement. Later NEW HOLDINGS amendments add to it.
  let holdings: Position[] | null = null;
  let sourceUrl = "";
  const accessions: string[] = [];
  for (const filing of period) {
    const table = await loadTable(cik, filing, cache);
    if (filing.form === "13F-HR" || table.amendmentType === "RESTATEMENT") holdings = table.holdings;
    else if (table.amendmentType === "NEW HOLDINGS" && holdings) holdings = aggregate([...holdings, ...table.holdings]);
    else throw new Error("SEC amendment cannot be safely combined with its original filing");
    sourceUrl = table.sourceUrl;
    accessions.push(filing.accession);
  }
  return { holdings: holdings!, sourceUrl, filing: period[period.length - 1], accessions };
}
function compactShares(value: number) {
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toLocaleString("en-US");
}
async function updateSnapshot(cik: string, requestedQuarter: string | null, cache?: CacheStore): Promise<Snapshot> {
  const filings = await filingsFor(cik, requestedQuarter);
  const availableQuarters = [...new Set(filings.map((f) => quarterFromDate(f.reportDate)!))];
  const quarter = requestedQuarter ?? availableQuarters[0];
  if (!quarter) throw new Error("No 13F-HR filings found");
  const current = await portfolioFor(cik, filings, quarter, cache);
  if (!current) throw new Error(`No 13F-HR filing for ${quarter}`);
  let previous: Portfolio | null = null;
  let warning: string | undefined;
  try { previous = await portfolioFor(cik, filings, previousQuarter(quarter), cache); }
  catch { warning = "上季度数据暂不可用，未计算季度变化"; }
  if (!previous) warning ??= "未找到上季度申报，未计算季度变化";
  const oldById = new Map(previous?.holdings.map((p) => [p.id, p]) ?? []);
  const total = current.holdings.reduce((sum, p) => sum + p.value, 0);
  const holdings = current.holdings.sort((a, b) => b.value - a.value).map((p, index) => {
    const old = oldById.get(p.id);
    const change = !previous ? null : old?.shares ? (p.shares - old.shares) / old.shares * 100 : 100;
    const ticker = tickerByCusip[p.cusip] ?? p.cusip;
    return { id: p.id, rank: index + 1, ticker: p.putCall ? `${ticker} ${p.putCall}` : ticker,
      company: p.company, sector: sectorByTicker[ticker] ?? "其他", value: p.value / 1e9, weight: total ? p.value / total * 100 : 0,
      shares: compactShares(p.shares), change: change === null ? null : Number(change.toFixed(1)),
      action: change === null ? "未知" : !old ? "新建" : change > .05 ? "增持" : change < -.05 ? "减持" : "持有", color: colors[index % colors.length] };
  });
  const currentIds = new Set(current.holdings.map((p) => p.id));
  const snapshot: Snapshot = { holdings, availableQuarters, meta: {
    quarter, totalValue: total / 1e9, count: holdings.length, filingDate: current.filing.filingDate, reportDate: current.filing.reportDate,
    sourceUrl: current.sourceUrl, removed: previous?.holdings.filter((p) => !currentIds.has(p.id)).length ?? 0,
    checkedAt: new Date().toISOString(), stale: false, comparisonAvailable: previous !== null, accession: current.filing.accession, accessions: current.accessions, warning,
  } };
  await cache?.set(`snapshot-v2:${cik}:${requestedQuarter ?? "latest"}`, snapshot);
  await cache?.set(`failure:${cik}:${requestedQuarter ?? "latest"}`, { error: null, failedAt: snapshot.meta.checkedAt });
  return snapshot;
}
async function readSnapshot(cik: string, quarter: string | null, cache?: CacheStore, force = false) {
  const key = `${cik}:${quarter ?? "latest"}`;
  const saved = await cache?.get<Snapshot>(`snapshot-v2:${key}`);
  const failure = await cache?.get<Failure>(`failure:${key}`);
  const failed = saved && failure?.error && failure.failedAt >= saved.meta.checkedAt;
  if (!force && saved && !failed && Date.now() - Date.parse(saved.meta.checkedAt) < REFRESH_INTERVAL_MS) return saved;
  if (!force && saved && failed && Date.now() - Date.parse(failure.failedAt) < 30_000) {
    return { ...saved, meta: { ...saved.meta, stale: true, warning: `最近同步失败，展示上次成功数据：${failure.error}` } };
  }
  let pending = inFlight.get(key);
  if (!pending) {
    pending = updateSnapshot(cik, quarter, cache).finally(() => { inFlight.delete(key); });
    inFlight.set(key, pending);
  }
  try { return await pending; }
  catch (error) {
    const message = error instanceof Error ? error.message : "SEC data unavailable";
    await cache?.set(`failure:${key}`, { error: message, failedAt: new Date().toISOString() });
    if (saved && !force) return { ...saved, meta: { ...saved.meta, stale: true, warning: `同步失败，展示上次成功数据：${message}` } };
    throw error;
  }
}
function cikFrom(request: Request) {
  const cik = new URL(request.url).searchParams.get("cik") ?? "";
  return /^\d{1,10}$/.test(cik) ? cik.padStart(10, "0") : null;
}
export async function getSec13f(request: Request, cache?: CacheStore) {
  const cik = cikFrom(request);
  const quarter = new URL(request.url).searchParams.get("quarter");
  if (!cik || (quarter !== null && !quarterEnd(quarter))) return Response.json({ error: "Invalid CIK or quarter" }, { status: 400, headers: RESPONSE_HEADERS });
  const force = new URL(request.url).searchParams.get("refresh") === "1";
  try { return Response.json(await readSnapshot(cik, quarter, cache, force), { headers: RESPONSE_HEADERS }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "SEC data unavailable" }, { status: 502, headers: RESPONSE_HEADERS }); }
}
export async function refreshSec13f(request: Request, cache?: CacheStore) {
  if (!cache) return Response.json({ error: "Persistent SEC cache unavailable" }, { status: 503, headers: RESPONSE_HEADERS });
  if (request.method === "GET") {
    const managers = await Promise.all(MANAGER_CIKS.map(async (cik) => {
      const snapshot = await cache.get<Snapshot>(`snapshot-v2:${cik}:latest`);
      const failure = await cache.get<Failure>(`failure:${cik}:latest`);
      return { cik, quarter: snapshot?.meta.quarter ?? null, checkedAt: snapshot?.meta.checkedAt ?? null, accession: snapshot?.meta.accession ?? null,
        error: failure?.error ?? null, failedAt: failure?.error ? failure.failedAt : null };
    }));
    return Response.json({ managers, intervalMinutes: 60 }, { headers: RESPONSE_HEADERS });
  }
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers: { ...RESPONSE_HEADERS, Allow: "GET, POST" } });
  const cik = cikFrom(request);
  if (!cik || !MANAGER_CIKS.includes(cik)) return Response.json({ error: "Unsupported manager CIK" }, { status: 400, headers: RESPONSE_HEADERS });
  // This writer relies on the existing owner-only Sites access boundary.
  try {
    const result = await readSnapshot(cik, null, cache, true);
    return Response.json({ cik, meta: result.meta }, { headers: RESPONSE_HEADERS });
  } catch (error) {
    return Response.json({ cik, error: error instanceof Error ? error.message : "SEC data unavailable" }, { status: 502, headers: RESPONSE_HEADERS });
  }
}

