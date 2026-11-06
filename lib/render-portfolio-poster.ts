import { buildPosterModel, formatBillionsAsYi, type PosterHolding } from "./portfolio-poster";

export type PosterManager = { name: string; manager: string; cik: string; image: string; artworkKind?: "person" | "institution" };
export type PosterMeta = {
  quarter: string; totalValue: number; count: number; reportDate: string;
  filingDate: string; accession: string; checkedAt: string; stale: boolean;
};
export const POSTER_WIDTH = 1080;
export const POSTER_HEIGHT = 1440;
const FONT = '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif';
const INK = "#29473d";
const PRIMARY = "#4f7564";
const ACCENT = "#789b8a";
const MUTED = "#687b72";
const BACKGROUND = "#f4f2ea";
const COLORS = ["#a8c3b4", "#b9c8d6", "#d7c2a5", "#c7b9cc", "#a8bdbf", "#cec5a8", "#b9c9a7", "#d6b8ae", "#c9cdc4"];

function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, color = INK, weight = 500, align: CanvasTextAlign = "center", maxWidth?: number) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  if (maxWidth) {
    while (ctx.measureText(value).width > maxWidth && size > 16) {
      size -= 1;
      ctx.font = `${weight} ${size}px ${FONT}`;
    }
  }
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(value, x, y, maxWidth);
}

function line(ctx: CanvasRenderingContext2D, x: number, y: number, width: number) {
  const stroke = ctx.createLinearGradient(x, y, x + width, y);
  stroke.addColorStop(0, "#789b8a00");
  stroke.addColorStop(.5, "#789b8a99");
  stroke.addColorStop(1, "#789b8a00");
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + width, y); ctx.stroke();
}

async function portrait(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => { img.onload = null; img.onerror = null; resolve(null); }, 8000);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    // Existing same-origin portraits keep PNG export independent of third-party CORS.
    img.src = src;
  });
}

/** Deterministic chart rendering: financial text is drawn from verified data. */
export async function renderPortfolioPoster(
  canvas: HTMLCanvasElement,
  manager: PosterManager,
  meta: PosterMeta,
  holdings: PosterHolding[],
  isLatest: boolean,
): Promise<void> {
  const model = buildPosterModel(holdings, meta.totalValue);
  if (meta.count !== model.count) throw new Error("持仓条目尚未完整同步，请刷新后重试");
  const [photo] = await Promise.all([portrait(manager.image), document.fonts.ready]);
  const illustrated = manager.image.includes("/cartoon/");
  canvas.width = POSTER_WIDTH * 2;
  canvas.height = POSTER_HEIGHT * 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("当前浏览器暂不支持图片生成");
  ctx.scale(2, 2);
  ctx.imageSmoothingQuality = "high";

  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
  const glow = ctx.createRadialGradient(40, 0, 10, 120, 180, 900);
  glow.addColorStop(0, "#c9ded3bb"); glow.addColorStop(.42, "#e4ebe5aa"); glow.addColorStop(1, "#f4f2ea00");
  ctx.fillStyle = glow; ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
  const bottomGlow = ctx.createRadialGradient(540, 1570, 0, 540, 1570, 440);
  bottomGlow.addColorStop(0, "#ded4c599"); bottomGlow.addColorStop(1, "#f4f2ea00");
  ctx.fillStyle = bottomGlow; ctx.fillRect(0, 1000, POSTER_WIDTH, 440);

  text(ctx, "13F TRACKER  /  INSTITUTIONAL PORTFOLIO", 540, 44, 18, MUTED, 500);
  const subject = manager.cik === "0001067983" ? "巴菲特" : manager.name;
  const headline = `${subject}${meta.stale ? "已收录持仓" : isLatest ? "最新持仓" : "季度持仓"}`;
  const titleFill = ctx.createLinearGradient(0, 65, 0, 135);
  titleFill.addColorStop(0, "#29473d"); titleFill.addColorStop(.55, "#4f7564"); titleFill.addColorStop(1, "#789b8a");
  ctx.font = `700 66px ${FONT}`;
  let titleSize = 66;
  while (ctx.measureText(headline).width > 940 && titleSize > 30) ctx.font = `700 ${--titleSize}px ${FONT}`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = titleFill;
  ctx.fillText(headline, 540, 102);
  text(ctx, `${meta.quarter.replace(" Q", " 年 Q")} 13F  ·  截至 ${meta.reportDate.replaceAll("-", "/")}`, 540, 163, 27, PRIMARY);
  text(ctx, `${manager.manager}  /  ${manager.name}`, 540, 205, 19, MUTED, 400, "center", 930);
  if (illustrated) text(ctx, !photo ? "机构标识" : manager.artworkKind === "institution" ? "AI 机构插画" : "AI 卡通形象", 540, 237, 15, "#829188");

  const cx = 540, cy = 625, outer = 374, inner = 222;
  for (let index = 0; index < model.segments.length; index++) {
    const segment = model.segments[index];
    ctx.beginPath();
    ctx.arc(cx, cy, outer, segment.startAngle, segment.endAngle);
    ctx.arc(cx, cy, inner, segment.endAngle, segment.startAngle, true);
    ctx.closePath();
    const fill = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
    fill.addColorStop(0, "#edf1ed"); fill.addColorStop(1, `${COLORS[index % COLORS.length]}ee`);
    ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = BACKGROUND; ctx.lineWidth = 4; ctx.stroke();

    const angle = (segment.startAngle + segment.endAngle) / 2;
    const x = cx + Math.cos(angle) * 300;
    const y = cy + Math.sin(angle) * 300;
    if ((segment.weight >= 3 && segment.label.length <= 6) || segment.weight >= 7) {
      const labelWidth = Math.min(155, 300 * (segment.endAngle - segment.startAngle) * .9);
      text(ctx, segment.label, x, y - 17, segment.rank === null ? 24 : 25, INK, 700, "center", labelWidth);
      text(ctx, `${segment.weight.toFixed(1)}%`, x, y + 18, 24, PRIMARY, 600);
    } else if (segment.weight >= 1.5 && segment.rank !== null) {
      text(ctx, String(segment.rank), x, y, 22, INK, 600);
    }
  }
  for (const radius of [inner - 2, outer + 2]) {
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = ACCENT; ctx.lineWidth = 2; ctx.stroke();
  }

  // Keep the character and numbers separate, without a rectangular photo frame.
  const centreFill = ctx.createRadialGradient(cx, cy - 140, 20, cx, cy, inner);
  centreFill.addColorStop(0, "#fbfaf6"); centreFill.addColorStop(1, "#e4ebe6");
  ctx.beginPath(); ctx.arc(cx, cy, inner - 8, 0, Math.PI * 2);
  ctx.fillStyle = centreFill; ctx.fill();

  if (illustrated && photo) {
    // A transparent bust floats inside the ring; numbers stay below the character.
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, inner - 9, 0, Math.PI * 2); ctx.clip();
    const scale = Math.min(308 / photo.naturalWidth, 274 / photo.naturalHeight);
    const w = photo.naturalWidth * scale, h = photo.naturalHeight * scale;
    ctx.drawImage(photo, cx - w / 2, cy - 204 + (274 - h) / 2, w, h);
    ctx.restore();
  } else {
    // Failed/unavailable artwork uses a clean institution mark instead of a broken photo.
    const initials = manager.cik === "0001759760" ? "H&H" : manager.manager.match(/[A-Za-z]+/g)?.map((part) => part[0]).slice(0, 2).join("") || manager.name.slice(0, 2);
    text(ctx, initials, cx, cy - 72, 66, PRIMARY, 600, "center", 240);
    text(ctx, manager.name, cx, cy - 7, 19, MUTED, 400, "center", 300);
  }
  line(ctx, cx - 114, cy + 84, 228);
  text(ctx, "13F 申报市值（美元）", cx, cy + 105, 18, PRIMARY);
  text(ctx, formatBillionsAsYi(meta.totalValue), cx, cy + 145, 42, INK, 700, "center", 380);
  text(ctx, `共 ${meta.count} 项持仓`, cx, cy + 182, 20, PRIMARY);
  if (!model.segments.length) text(ctx, "本期无持仓金额", cx, cy - inner - 20, 23, PRIMARY);

  text(ctx, `前十大持仓  /  合计 ${model.topTenWeight.toFixed(1)}%`, 64, 1044, 25, PRIMARY, 600, "left");
  text(ctx, "申报市值 · 占比", 1016, 1044, 19, MUTED, 400, "right");
  line(ctx, 64, 1072, 952);
  for (const holding of model.topHoldings) {
    const index = holding.rank - 1;
    const column = index < 5 ? 0 : 1;
    const row = index % 5;
    const x = column ? 565 : 64;
    const y = 1111 + row * 43;
    const color = COLORS[Math.min(index, 8)];
    ctx.beginPath(); ctx.arc(x + 13, y, 12, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
    text(ctx, String(holding.rank), x + 13, y, 15, INK, 700);
    text(ctx, holding.ticker, x + 42, y, 21, INK, 600, "left", 170);
    text(ctx, holding.company, x + 42, y + 18, 12, MUTED, 400, "left", 400);
    text(ctx, formatBillionsAsYi(holding.value), x + 327, y, 20, PRIMARY, 500, "right", 120);
    text(ctx, `${holding.weight.toFixed(1)}%`, x + 451, y, 20, INK, 600, "right");
  }
  line(ctx, 64, 1322, 952);
  const checkedDate = meta.checkedAt.slice(0, 10).replaceAll("-", "/");
  const status = meta.stale ? "上次成功数据 · 同步待恢复" : `检查于 ${checkedDate}`;
  text(ctx, `SEC EDGAR  ·  披露于 ${meta.filingDate.replaceAll("-", "/")}  ·  ${status}`, 540, 1352, 18, meta.stale ? "#a56d38" : MUTED);
  text(ctx, "圆环按真实占比显示前八及其他，小扇区数字对应排名；不同证券及期权分列。", 540, 1382, 17, MUTED);
  text(ctx, "市值为报告期末申报值，金额与占比经四舍五入；不代表实时持仓，仅供研究。", 540, 1410, 17, MUTED);
}
