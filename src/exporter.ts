import { jsPDF } from "jspdf";
import JSZip from "jszip";
import type { Project, RecipientRow } from "./types";

const DEFAULT_EXPORT_TEMPLATE =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1131">
  <defs>
    <linearGradient id="paper" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#fdfbf7"/>
      <stop offset="0.54" stop-color="#faf6ed"/>
      <stop offset="1" stop-color="#fdfbf7"/>
    </linearGradient>
    <pattern id="grid" width="44" height="44" patternUnits="userSpaceOnUse">
      <path d="M44 0H0V44" fill="none" stroke="#1a1612" stroke-opacity=".04" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="1600" height="1131" fill="url(#paper)"/>
  <rect width="1600" height="1131" fill="url(#grid)"/>
  <rect x="92" y="92" width="1416" height="947" rx="36" fill="none" stroke="#c9a84c" stroke-width="7"/>
  <rect x="124" y="124" width="1352" height="883" rx="24" fill="none" stroke="#c9a84c" stroke-opacity=".45" stroke-width="2"/>
  <circle cx="800" cy="252" r="58" fill="#1a1612"/>
  <path d="M772 241h56M772 261h37" stroke="#c9a84c" stroke-width="8" stroke-linecap="round"/>
  <circle cx="842" cy="279" r="28" fill="#c9a84c"/>
  <path d="M828 279l10 11 21-25" fill="none" stroke="#1a1612" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="800" y="382" text-anchor="middle" font-family="Georgia, serif" font-size="70" fill="#1a1612">Certificate of Achievement</text>
  <text x="800" y="466" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" letter-spacing="5" fill="#9a8b6d">PROUDLY PRESENTED TO</text>
  <text x="800" y="678" text-anchor="middle" font-family="Arial, sans-serif" font-size="29" fill="#7d6f55">for successfully completing</text>
  <line x1="292" y1="887" x2="568" y2="887" stroke="#7d6f55" stroke-width="2"/>
  <line x1="1032" y1="887" x2="1308" y2="887" stroke="#7d6f55" stroke-width="2"/>
  <text x="430" y="929" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" fill="#7d6f55">Date</text>
  <text x="1170" y="929" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" fill="#7d6f55">Director</text>
</svg>`);

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });

const fitText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let result = text;
  while (result.length > 1 && ctx.measureText(`${result}...`).width > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result}...`;
};

export const renderProjectToPng = async (project: Project, row: RecipientRow, quality = 2) => {
  const sourceWidth = project.template?.width || 1600;
  const sourceHeight = project.template?.height || 1131;
  const width = Math.round(sourceWidth * quality);
  const height = Math.round(sourceHeight * quality);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available.");

  const template = await loadImage(project.template?.dataUrl || DEFAULT_EXPORT_TEMPLATE);
  ctx.fillStyle = "#fdfbf7";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(template, 0, 0, width, height);

  for (const field of project.fields) {
    const column = project.mappings[field.placeholder] || field.placeholder;
    const value = row.values[column] || row.values[field.placeholder] || `{{${field.placeholder}}}`;
    const x = (field.x / 100) * width;
    const y = (field.y / 100) * height;
    const boxWidth = (field.width / 100) * width;
    const boxHeight = (field.height / 100) * height;
    const fontSize = field.fontSize * quality;
    ctx.font = `${field.weight} ${fontSize}px "${field.fontFamily}", Georgia, serif`;
    ctx.fillStyle = field.color;
    ctx.textAlign = field.align;
    ctx.textBaseline = "middle";
    const textX = field.align === "center" ? x + boxWidth / 2 : field.align === "right" ? x + boxWidth : x;
    ctx.fillText(fitText(ctx, value, boxWidth), textX, y + boxHeight / 2, boxWidth);
  }

  return canvas.toDataURL("image/png");
};

export const dataUrlToBlob = async (dataUrl: string) => {
  const response = await fetch(dataUrl);
  return response.blob();
};

export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export const makePdfBlob = (pngDataUrl: string, width = 1600, height = 1131) => {
  const orientation = width >= height ? "landscape" : "portrait";
  const pdf = new jsPDF({
    orientation,
    unit: "px",
    format: [width, height]
  });
  pdf.addImage(pngDataUrl, "PNG", 0, 0, width, height);
  return pdf.output("blob");
};

export const safeFileName = (value: string) =>
  value
    .trim()
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "certificate";

export const zipCertificates = async (
  project: Project,
  rows: RecipientRow[],
  renderRow: (row: RecipientRow) => Promise<string>,
  size: { width: number; height: number }
) => {
  const zip = new JSZip();
  for (const row of rows) {
    const png = await renderRow(row);
    const fileStem = safeFileName(
      row.values.name || row.values[project.mappings.name] || row.id
    );
    if (project.exportSettings.format === "png") {
      zip.file(`${fileStem}.png`, await dataUrlToBlob(png));
    } else {
      zip.file(`${fileStem}.pdf`, makePdfBlob(png, size.width, size.height));
    }
  }
  return zip.generateAsync({ type: "blob" });
};
