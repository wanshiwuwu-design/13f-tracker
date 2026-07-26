type SecRecent = {
  form: string[];
  accessionNumber: string[];
  reportDate: string[];
  filingDate: string[];
};

type Filing = {
  accession: string;
  reportDate: string;
  filingDate: string;
};

const SEC_HEADERS = {
  "User-Agent": "13FTracker/1.0 research@13ftracker.app",
  Accept: "application/json, application/xml, text/xml, */*",
};

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

// Duquesne's information table still reports column 4 in thousands of dollars.
const valueScaleByCik: Record<string, number> = {
  "1536411": 1_000,
};

function decode(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();
}

function tag(block: string, name: string) {
  const match = block.match(new RegExp(`<(?:[\\w-]+:)?${name}[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${name}>`, "i"));
  return match ? decode(match[1].replace(/<[^>]+>/g, "")) : "";
}

function quarterEnd(quarter: string) {
  const match = quarter.match(/^(\d{4}) Q([1-4])$/);
  if (!match) return null;
  const ends = ["03-31", "06-30", "09-30", "12-31"];
  return `${match[1]}-${ends[Number(match[2]) - 1]}`;
}

function previousQuarter(quarter: string) {
  const match = quarter.match(/^(\d{4}) Q([1-4])$/);
  if (!match) return quarter;
  const year = Number(match[1]);
  const q = Number(match[2]);
  return q === 1 ? `${year - 1} Q4` : `${year} Q${q - 1}`;
}

async function fetchJson(url: string) {
  const response = await fetch(url, { headers: SEC_HEADERS });
  if (!response.ok) throw new Error(`SEC request failed (${response.status})`);
  return response.json();
}

async function filingsFor(cik: string): Promise<Filing[]> {
  const padded = cik.padStart(10, "0");
  const submission = await fetchJson(`https://data.sec.gov/submissions/CIK${padded}.json`);
  const recent = submission.filings.recent as SecRecent;
  return recent.form.flatMap((form, index) => form === "13F-HR" ? [{
    accession: recent.accessionNumber[index],
    reportDate: recent.reportDate[index],
    filingDate: recent.filingDate[index],
  }] : []);
}

async function loadHoldings(cik: string, filing: Filing) {
  const cikNumber = String(Number(cik));
  const valueScale = valueScaleByCik[cikNumber] ?? 1;
  const accession = filing.accession.replace(/-/g, "");
  const base = `https://www.sec.gov/Archives/edgar/data/${cikNumber}/${accession}`;
  const index = await fetchJson(`${base}/index.json`);
  const items = (index.directory?.item ?? []) as Array<{ name: string }>;
  const xmlName = items.map((item) => item.name).find((name) => /\.xml$/i.test(name) && !/primary|schema|cal|def|lab|pre/i.test(name));
  if (!xmlName) throw new Error("SEC information table not found");
  const response = await fetch(`${base}/${xmlName}`, { headers: SEC_HEADERS });
  if (!response.ok) throw new Error(`SEC information table failed (${response.status})`);
  const xml = await response.text();
  const blocks = xml.match(/<(?:[\w-]+:)?infoTable\b[\s\S]*?<\/(?:[\w-]+:)?infoTable>/gi) ?? [];
  const aggregated = new Map<string, { company: string; title: string; cusip: string; value: number; shares: number }>();
  for (const block of blocks) {
    const cusip = tag(block, "cusip");
    const current = aggregated.get(cusip) ?? { company: tag(block, "nameOfIssuer"), title: tag(block, "titleOfClass"), cusip, value: 0, shares: 0 };
    current.value += (Number(tag(block, "value").replace(/,/g, "")) || 0) * valueScale;
    current.shares += Number(tag(block, "sshPrnamt").replace(/,/g, "")) || 0;
    aggregated.set(cusip, current);
  }
  return { holdings: [...aggregated.values()], sourceUrl: `${base}/${filing.accession}-index.html` };
}

function compactShares(value: number) {
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toLocaleString("en-US");
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cik = (searchParams.get("cik") ?? "").replace(/\D/g, "");
  const quarter = searchParams.get("quarter") ?? "2026 Q1";
  if (!cik || !quarterEnd(quarter)) return Response.json({ error: "Invalid CIK or quarter" }, { status: 400 });

  try {
    const filings = await filingsFor(cik);
    const currentFiling = filings.find((item) => item.reportDate === quarterEnd(quarter));
    if (!currentFiling) return Response.json({ error: `No 13F-HR filing for ${quarter}` }, { status: 404 });
    const previousFiling = filings.find((item) => item.reportDate === quarterEnd(previousQuarter(quarter)));
    const current = await loadHoldings(cik, currentFiling);
    const previous = previousFiling ? await loadHoldings(cik, previousFiling) : null;
    const previousShares = new Map(previous?.holdings.map((item) => [item.cusip, item.shares]) ?? []);
    const total = current.holdings.reduce((sum, item) => sum + item.value, 0);
    const holdings = current.holdings
      .sort((a, b) => b.value - a.value)
      .map((item, index) => {
        const oldShares = previousShares.get(item.cusip);
        const change = oldShares === undefined ? 100 : oldShares === 0 ? 100 : ((item.shares - oldShares) / oldShares) * 100;
        const ticker = tickerByCusip[item.cusip] ?? item.company.replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase();
        return {
          rank: index + 1,
          ticker,
          company: item.company,
          sector: sectorByTicker[ticker] ?? "其他",
          value: item.value / 1e9,
          weight: total ? item.value / total * 100 : 0,
          shares: compactShares(item.shares),
          change: Number(change.toFixed(1)),
          action: oldShares === undefined ? "新建" : change > .05 ? "增持" : change < -.05 ? "减持" : "持有",
          color: colors[index % colors.length],
        };
      });
    const removed = previous?.holdings.filter((item) => !current.holdings.some((now) => now.cusip === item.cusip)).length ?? 0;
    return Response.json({
      holdings,
      meta: {
        totalValue: total / 1e9,
        count: holdings.length,
        filingDate: currentFiling.filingDate,
        reportDate: currentFiling.reportDate,
        sourceUrl: current.sourceUrl,
        removed,
      },
    }, { headers: { "Cache-Control": "public, max-age=3600, s-maxage=21600" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "SEC data unavailable" }, { status: 502 });
  }
}
