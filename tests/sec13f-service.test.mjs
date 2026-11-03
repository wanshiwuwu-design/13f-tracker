import assert from "node:assert/strict";
import test from "node:test";
import { D1Cache, getSec13f, refreshSec13f } from "../lib/sec13f.ts";

const CIK = "0001067983";
const latestKey = `snapshot-v2:${CIK}:latest`;
class MemoryCache {
  values = new Map();
  async get(key) { return structuredClone(this.values.get(key) ?? null); }
  async set(key, value) { this.values.set(key, structuredClone(value)); }
  async expire(key = latestKey) {
    const saved = await this.get(key);
    saved.meta.checkedAt = "2020-01-01T00:00:00Z";
    await this.set(key, saved);
  }
}
function filing(id, reportDate = "2026-06-30", extra = {}) {
  return {
    accession: `0001067983-26-${String(id).padStart(6, "0")}`,
    reportDate, filingDate: "2026-08-14", form: "13F-HR",
    accepted: `2026-08-14T16:00:${String(id).padStart(2, "0")}Z`,
    positions: [{ cusip: "037833100", company: "APPLE &amp; CO", value: 2e9, shares: 20 }],
    ...extra,
  };
}
function xmlTable(positions, prefix = "") {
  const tag = (name, value) => `<${prefix}${name}>${value}</${prefix}${name}>`;
  return `<?xml version="1.0"?><${prefix}informationTable xmlns:ns="urn:sec:13f">${positions.map(p => tag("infoTable",
    tag("nameOfIssuer", p.company) + tag("titleOfClass", p.title ?? "COM") + tag("cusip", p.cusip)
    + tag("value", p.value) + tag("sshPrnamt", p.shares) + tag("sshPrnamtType", "SH")
    + (p.putCall ? tag("putCall", p.putCall) : ""),
  )).join("")}</${prefix}informationTable>`;
}
function mockSec(t, filings) {
  const originalFetch = globalThis.fetch;
  const state = { filings, calls: [], status: 200 };
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    state.calls.push({ url, init });
    if (state.status !== 200) return new Response("SEC unavailable", { status: state.status });
    if (url === `https://data.sec.gov/submissions/CIK${CIK}.json`) {
      const recent = Object.fromEntries([
        ["form", "form"], ["accessionNumber", "accession"], ["reportDate", "reportDate"],
        ["filingDate", "filingDate"], ["acceptanceDateTime", "accepted"],
      ].map(([key, field]) => [key, state.filings.map(f => f[field])]));
      recent.primaryDocument = state.filings.map(() => "xslForm13F_X02/primary_doc.xml");
      return Response.json({ filings: { recent, files: [] } });
    }
    const selected = state.filings.find(f => url.includes(`/${f.accession.replaceAll("-", "")}/`));
    if (!selected) throw new Error(`Unexpected SEC URL: ${url}`);
    const cover = `<edgarSubmission><tableEntryTotal>${selected.expected ?? selected.positions.length}</tableEntryTotal>${selected.amendmentType ? `<amendmentType>${selected.amendmentType}</amendmentType>` : ""}</edgarSubmission>`;
    const files = selected.files ?? { "primary_doc.xml": cover, "holdings.xml": xmlTable(selected.positions, selected.prefix) };
    if (url.endsWith("/index.json")) return Response.json({ directory: { item: Object.keys(files).map(name => ({ name })) } });
    const name = url.split("/").pop();
    if (!(name in files)) throw new Error(`Unexpected SEC document: ${url}`);
    return new Response(files[name]);
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  return state;
}
const request = (query = "", method = "GET") => new Request(`https://tracker.example/api/sec13f${method === "POST" ? "/refresh" : ""}?cik=${CIK}${query}`, { method });
const read = async (cache, query = "") => {
  const response = await getSec13f(request(query), cache);
  return { response, body: await response.json() };
};
const refresh = (cache) => refreshSec13f(request("", "POST"), cache);

test("latest follows a newly disclosed quarter while a pinned quarter remains fixed", async t => {
  const q1 = filing(1, "2026-03-31", { positions: [{ cusip: "037833100", company: "APPLE", value: 1e9, shares: 10 }] });
  const q2 = filing(2);
  const sec = mockSec(t, [q2, q1]);
  const cache = new MemoryCache();
  const initial = await read(cache);
  assert.equal(initial.response.status, 200);
  assert.equal(initial.response.headers.get("cache-control"), "no-store");
  assert.equal(initial.body.meta.quarter, "2026 Q2");
  assert.equal(initial.body.holdings[0].change, 100);
  assert.equal((await read(cache, "&quarter=2026%20Q2")).body.meta.quarter, "2026 Q2");
  const q3 = filing(3, "2026-09-30", { filingDate: "2026-11-02" });
  sec.filings = [q1, q3, q2]; // Do not rely on SEC array order.
  assert.equal((await refresh(cache)).status, 200);
  const latest = (await read(cache)).body;
  assert.equal(latest.meta.quarter, "2026 Q3");
  assert.deepEqual(latest.availableQuarters, ["2026 Q3", "2026 Q2", "2026 Q1"]);
  assert.equal((await read(cache, "&quarter=2026%20Q2")).body.meta.quarter, "2026 Q2");
});

test("unchanged refresh checks submissions once and reuses accession-level XML cache", async t => {
  const sec = mockSec(t, [filing(2), filing(1, "2026-03-31")]);
  const cache = new MemoryCache();
  assert.equal((await refresh(cache)).status, 200);
  assert(sec.calls.some(call => call.url.endsWith(".xml")));
  sec.calls.length = 0;
  assert.equal((await refresh(cache)).status, 200);
  assert.deepEqual(sec.calls.map(call => call.url), [`https://data.sec.gov/submissions/CIK${CIK}.json`]);
  assert.equal(sec.calls[0].init.cache, "no-store");
});

test("SEC 403 preserves the last snapshot, marks reads stale, and fails the writer", async t => {
  const sec = mockSec(t, [filing(2)]);
  const cache = new MemoryCache();
  assert.equal((await refresh(cache)).status, 200);
  await cache.expire();
  const saved = await cache.get(latestKey);
  sec.status = 403;
  const fallback = await read(cache);
  assert.equal(fallback.response.status, 200);
  assert.equal(fallback.body.meta.stale, true);
  assert.match(fallback.body.meta.warning, /403/);
  assert.deepEqual(fallback.body.holdings, saved.holdings);
  assert.equal((await refresh(cache)).status, 502);
  assert.deepEqual(await cache.get(latestKey), saved, "failure must not overwrite the successful snapshot");
  const report = await refreshSec13f(new Request("https://tracker.example/api/sec13f/refresh"), cache);
  const manager = (await report.json()).managers.find(item => item.cik === CIK);
  assert.match(manager.error, /403/);
  sec.status = 200;
  assert.equal((await refresh(cache)).status, 200);
  assert.equal((await read(cache)).body.meta.stale, false);
});

test("SEC failure with no snapshot returns 502 rather than success with empty holdings", async t => {
  const sec = mockSec(t, []);
  sec.status = 403;
  const { response, body } = await read(new MemoryCache());
  assert.equal(response.status, 502);
  assert.match(body.error, /403/);
  assert.equal(body.holdings, undefined);
});

test("RESTATEMENT replaces the original and later NEW HOLDINGS adds to the replacement", async t => {
  const original = filing(1);
  const restatement = filing(2, "2026-06-30", { form: "13F-HR/A", amendmentType: "RESTATEMENT", positions: [{ cusip: "594918104", company: "MICROSOFT", value: 3e9, shares: 30 }] });
  const addition = filing(3, "2026-06-30", { form: "13F-HR/A", amendmentType: "NEW HOLDINGS", positions: [{ cusip: "191216100", company: "COCA COLA", value: 1e9, shares: 10 }] });
  mockSec(t, [addition, original, restatement]);
  const { response, body } = await read(new MemoryCache());
  assert.equal(response.status, 200);
  assert.deepEqual(body.holdings.map(p => p.ticker), ["MSFT", "KO"]);
  assert.equal(body.meta.totalValue, 4);
  assert.equal(body.meta.accession, addition.accession);
  assert.deepEqual(body.meta.accessions, [original.accession, restatement.accession, addition.accession]);
});

test("recognizes namespaced information tables and ignores cover and unrelated XML", async t => {
  const positions = filing(1).positions;
  mockSec(t, [filing(1, "2026-06-30", { files: {
    "aaa-cover.xml": "<edgarSubmission><tableEntryTotal>1</tableEntryTotal></edgarSubmission>",
    "primary_doc.xml": "<edgarSubmission><tableEntryTotal>1</tableEntryTotal></edgarSubmission>",
    "unrelated.xml": "<document><value>999999999999</value></document>",
    "named-table.xml": xmlTable(positions, "ns:"),
  } })]);
  const { response, body } = await read(new MemoryCache());
  assert.equal(response.status, 200);
  assert.equal(body.meta.count, 1);
  assert.equal(body.meta.totalValue, 2);
  assert.equal(body.holdings[0].company, "APPLE & CO");
});

test("rejects an unverified empty information table without writing a snapshot", async t => {
  mockSec(t, [filing(1, "2026-06-30", { files: {
    "primary_doc.xml": "<edgarSubmission><tableEntryTotal>1</tableEntryTotal></edgarSubmission>",
    "holdings.xml": "<informationTable></informationTable>",
  } })]);
  const cache = new MemoryCache();
  assert.equal((await read(cache)).response.status, 502);
  assert.equal(await cache.get(latestKey), null);
  assert(![...cache.values.keys()].some(key => key.startsWith("table-v2:")));
});

test("missing prior quarter yields unknown changes; CUSIP and options retain distinct identities", async t => {
  mockSec(t, [filing(1, "2026-06-30", { positions: [
    { cusip: "037833100", company: "APPLE", value: 2e9, shares: 20 },
    { cusip: "037833100", company: "APPLE", putCall: "PUT", value: 1e9, shares: 10 },
    { cusip: "123456789", company: "UNKNOWN ISSUER", value: 1e9, shares: 10 },
  ] })]);
  const { response, body } = await read(new MemoryCache());
  assert.equal(response.status, 200);
  assert.equal(body.meta.comparisonAvailable, false);
  assert.match(body.meta.warning, /上季度/);
  assert(body.holdings.every(p => p.change === null && p.action === "未知"));
  assert.equal(new Set(body.holdings.map(p => p.id)).size, 3);
  assert(body.holdings.some(p => p.ticker === "AAPL PUT"));
  assert(body.holdings.some(p => p.ticker === "123456789"));
});

test("strict parameters and unsupported writers fail before fetching SEC", async t => {
  const sec = mockSec(t, []);
  const invalid = ["", "abc1067983", "12345678901", "12.3", "-1"];
  for (const cik of invalid) {
    assert.equal((await getSec13f(new Request(`https://tracker.example/api/sec13f?cik=${cik}`), new MemoryCache())).status, 400);
  }
  for (const quarter of ["", "2026 Q5", "2026Q2", "2026 Q2 "]) {
    assert.equal((await getSec13f(request(`&quarter=${encodeURIComponent(quarter)}`), new MemoryCache())).status, 400);
  }
  assert.equal((await refreshSec13f(new Request("https://tracker.example/api/sec13f/refresh?cik=123", { method: "POST" }), new MemoryCache())).status, 400);
  assert.equal((await refreshSec13f(request("", "POST"))).status, 503);
  const unsupported = await refreshSec13f(new Request("https://tracker.example/api/sec13f/refresh", { method: "DELETE" }), new MemoryCache());
  assert.equal(unsupported.status, 405);
  assert.equal(unsupported.headers.get("allow"), "GET, POST");
  assert.equal(sec.calls.length, 0);
});

test("D1Cache round-trips JSON and binds cache keys rather than interpolating SQL", async () => {
  const rows = new Map();
  const calls = [];
  const db = { prepare(sql) { return { bind(...values) {
    calls.push({ sql, values });
    return {
      async first() { return rows.has(values[0]) ? { payload: rows.get(values[0]) } : null; },
      async run() { rows.set(values[0], values[1]); },
    };
  } }; } };
  const cache = new D1Cache(db);
  const key = "manager:';DROP TABLE sec13f_cache;--";
  assert.equal(await cache.get(key), null);
  await cache.set(key, { holdings: [{ change: null }], meta: { stale: false } });
  assert.deepEqual(await cache.get(key), { holdings: [{ change: null }], meta: { stale: false } });
  await cache.set(key, { updated: true });
  assert.deepEqual(await cache.get(key), { updated: true });
  assert(calls.every(call => !call.sql.includes(key) && call.values[0] === key));
  assert(calls.filter(call => call.sql.startsWith("INSERT")).every(call => !Number.isNaN(Date.parse(call.values[2]))));
});
