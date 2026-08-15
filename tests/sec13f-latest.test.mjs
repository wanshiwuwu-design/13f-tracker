import assert from "node:assert/strict";
import test from "node:test";

const submission = {
  cik: "1067983",
  entityType: "operating",
  sic: "6331",
  sicDescription: "Fire, Marine & Casualty Insurance",
  ownerOrg: "02 Finance",
  insiderTransactionForOwnerExists: 0,
  insiderTransactionForIssuerExists: 1,
  name: "BERKSHIRE HATHAWAY INC",
  tickers: ["BRK-A", "BRK-B"],
  exchanges: ["NYSE", "NYSE"],
  ein: "470813844",
  lei: null,
  description: "",
  website: "",
  investorWebsite: "",
  category: "Large accelerated filer",
  fiscalYearEnd: "1231",
  stateOfIncorporation: "DE",
  stateOfIncorporationDescription: "DE",
  addresses: { mailing: {}, business: {} },
  phone: "4023461400",
  flags: "",
  formerNames: [],
  filings: {
    recent: {
      accessionNumber: ["0001193125-26-352200", "0001193125-26-226661"],
      filingDate: ["2026-08-14", "2026-05-15"],
      reportDate: ["2026-06-30", "2026-03-31"],
      acceptanceDateTime: ["2026-08-14T16:00:00.000Z", "2026-05-15T16:00:00.000Z"],
      act: ["34", "34"],
      form: ["13F-HR", "13F-HR"],
      fileNumber: ["028-04545", "028-04545"],
      filmNumber: ["261234567", "261111111"],
      items: ["", ""],
      size: [12345, 12000],
      isXBRL: [0, 0],
      isInlineXBRL: [0, 0],
      primaryDocument: ["xslForm13F_X02/primary_doc.xml", "xslForm13F_X02/primary_doc.xml"],
      primaryDocDescription: ["13F-HR", "13F-HR"],
    },
    files: [],
  },
};

const currentXml = `<?xml version="1.0"?><informationTable><infoTable><nameOfIssuer>APPLE INC</nameOfIssuer><titleOfClass>COM</titleOfClass><cusip>037833100</cusip><value>2000</value><shrsOrPrnAmt><sshPrnamt>20</sshPrnamt></shrsOrPrnAmt></infoTable></informationTable>`;
const previousXml = `<?xml version="1.0"?><informationTable><infoTable><nameOfIssuer>APPLE INC</nameOfIssuer><titleOfClass>COM</titleOfClass><cusip>037833100</cusip><value>1000</value><shrsOrPrnAmt><sshPrnamt>10</sshPrnamt></shrsOrPrnAmt></infoTable></informationTable>`;

test("omitting quarter returns the manager's newest disclosed 13F quarter", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/submissions/CIK0001067983.json")) {
      return Response.json(submission);
    }
    if (url.endsWith("/000119312526352200/index.json")) {
      return Response.json({ directory: { item: [{ name: "infotable.xml" }] } });
    }
    if (url.endsWith("/000119312526226661/index.json")) {
      return Response.json({ directory: { item: [{ name: "infotable.xml" }] } });
    }
    if (url.endsWith("/000119312526352200/infotable.xml")) {
      return new Response(currentXml, { status: 200 });
    }
    if (url.endsWith("/000119312526226661/infotable.xml")) {
      return new Response(previousXml, { status: 200 });
    }
    return new Response("Not found", { status: 404 });
  };

  try {
    const workerUrl = new URL("../dist/server/index.js", import.meta.url);
    workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
    const { default: worker } = await import(workerUrl.href);
    const response = await worker.fetch(
      new Request("http://localhost/api/sec13f?cik=0001067983"),
      { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
      { waitUntil() {}, passThroughOnException() {} },
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.meta.quarter, "2026 Q2");
    assert.deepEqual(body.availableQuarters, ["2026 Q2", "2026 Q1"]);
    assert.equal(body.holdings[0].change, 100);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
