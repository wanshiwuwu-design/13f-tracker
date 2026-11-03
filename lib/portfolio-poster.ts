/** All monetary inputs use billions of US dollars, matching /api/sec13f. */
export type PosterHolding = {
  id?: string;
  ticker: string;
  company: string;
  value: number;
  weight?: number;
};

export type PosterPosition = {
  id: string;
  ticker: string;
  company: string;
  value: number;
  weight: number;
  rank: number;
};

export type PosterSegment = {
  id: string;
  label: string;
  value: number;
  weight: number;
  startAngle: number;
  endAngle: number;
  rank: number | null;
};

export type PosterModel = {
  topHoldings: PosterPosition[];
  segments: PosterSegment[];
  totalValue: number;
  count: number;
  topTenWeight: number;
  otherCount: number;
};

function checkValue(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("持仓金额必须为有限的非负数");
  }
}

export function buildPosterModel(holdings: PosterHolding[], totalValue: number): PosterModel {
  checkValue(totalValue);
  holdings.forEach((holding) => checkValue(holding.value));
  const sum = holdings.reduce((result, holding) => result + holding.value, 0);
  const scale = Math.max(sum, totalValue);
  if (!Number.isFinite(sum) || Math.abs(sum - totalValue) > scale * 1e-9) {
    throw new Error("持仓明细与总市值不一致，暂不能生成图片");
  }

  // Work on new objects so drawing never changes the dashboard's ordering or values.
  const positions = holdings.map((holding, index) => ({
    id: holding.id ?? `${holding.ticker}:${index}`,
    ticker: holding.ticker,
    company: holding.company,
    value: holding.value,
    weight: totalValue > 0 ? holding.value / totalValue * 100 : 0,
    rank: 0,
  })).sort((a, b) => b.value - a.value).map((holding, index) => ({ ...holding, rank: index + 1 }));

  const ringPositions = positions.filter((holding) => holding.value > 0).slice(0, 8);
  const remaining = positions.filter((holding) => holding.value > 0).slice(8);
  const values = ringPositions.map((holding) => ({
    id: holding.id,
    label: holding.ticker,
    value: holding.value,
    weight: holding.weight,
    rank: holding.rank as number | null,
  }));
  if (remaining.length) {
    const value = remaining.reduce((result, holding) => result + holding.value, 0);
    values.push({ id: "portfolio-other", label: "其他", value, weight: value / totalValue * 100, rank: null });
  }

  const start = -Math.PI / 2;
  let cursor = start;
  const segments = values.map((holding, index) => {
    const startAngle = cursor;
    // Close the circle exactly; do not leave a visible floating-point seam.
    cursor = index === values.length - 1 ? start + Math.PI * 2 : cursor + holding.value / totalValue * Math.PI * 2;
    return { ...holding, startAngle, endAngle: cursor };
  });
  const topHoldings = positions.slice(0, 10);
  return {
    topHoldings,
    segments,
    totalValue,
    count: holdings.length,
    topTenWeight: topHoldings.reduce((result, holding) => result + holding.weight, 0),
    otherCount: holdings.length - ringPositions.length,
  };
}

export function formatBillionsAsYi(value: number): string {
  checkValue(value);
  const oneDecimal = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (value === 0 || value >= .1) return `${oneDecimal.format(value * 10)}亿`;
  const dollars = value * 1e9;
  if (dollars >= 10_000) return `${oneDecimal.format(dollars / 10_000)}万美元`;
  return `${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(dollars)}美元`;
}

export function posterFileName(name: string, quarter: string): string {
  const clean = (value: string) => value.replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, "_").replace(/[. ]+$/g, "").trim().slice(0, 100);
  return `${clean(name) || "13F"}_${clean(quarter) || "持仓"}_持仓海报.png`;
}
