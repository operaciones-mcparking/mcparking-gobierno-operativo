import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { cwd } from "node:process";

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";

import type { ProcessMasterDto } from "../../app/procesos/process-master/process-master-types";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 42;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const NAVY = rgb(2 / 255, 53 / 255, 116 / 255);
const YELLOW = rgb(245 / 255, 179 / 255, 1 / 255);
const LIGHT = rgb(248 / 255, 250 / 255, 251 / 255);
const LINE = rgb(214 / 255, 225 / 255, 234 / 255);
const SLATE = rgb(71 / 255, 85 / 255, 105 / 255);
const WHITE = rgb(1, 1, 1);

function text(value: string | null | undefined, fallback = "No documentado") {
  return value?.trim() || fallback;
}

function pdfText(value: string) {
  return value
    .replaceAll("–", "-")
    .replaceAll("—", "-")
    .replaceAll("‘", "'")
    .replaceAll("’", "'")
    .replaceAll("“", '"')
    .replaceAll("”", '"')
    .replaceAll("•", "-")
    .replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/g, "?");
}

function documentaryDate(value: string | null | undefined) {
  if (!value) return "No documentada";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No documentada";
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Santiago",
    year: "numeric",
  }).format(date);
}

function processType(value: ProcessMasterDto["process"]["process_type"]) {
  if (value === "strategic") return "Estrategico";
  if (value === "support") return "Soporte";
  return "Operativo";
}

function processStatus(value: ProcessMasterDto["process"]["status"]) {
  if (value === "active") return "Vigente";
  if (value === "archived") return "Archivado";
  return "Borrador";
}

function splitLongWord(word: string, font: PDFFont, size: number, width: number) {
  const chunks: string[] = [];
  let chunk = "";
  for (const character of word) {
    if (chunk && font.widthOfTextAtSize(chunk + character, size) > width) {
      chunks.push(chunk);
      chunk = character;
    } else {
      chunk += character;
    }
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

function wrap(value: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  for (const paragraph of pdfText(value).split(/\r?\n/)) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean).flatMap((word) =>
      font.widthOfTextAtSize(word, size) > width ? splitLongWord(word, font, size, width) : [word],
    );
    let line = "";
    for (const word of words) {
      const candidate = line ? line + " " + word : word;
      if (line && font.widthOfTextAtSize(candidate, size) > width) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    lines.push(line || " ");
  }
  return lines.length ? lines : [" "];
}

export function shouldAddPdfPage(currentY: number, requiredHeight: number) {
  return currentY - requiredHeight < MARGIN + 16;
}

export type PdfTablePagePlan = {
  continuation: boolean;
  rowIndexes: number[];
};

export function planPdfTablePages(
  currentY: number,
  rowHeights: number[],
  sectionHeight = 28,
  headerHeight = 19,
) {
  const pageTop = PAGE_HEIGHT - MARGIN;
  const pageBottom = MARGIN + 16;
  const maximumRowHeight = pageTop - pageBottom - sectionHeight - headerHeight;
  const startsOnNewPage = shouldAddPdfPage(
    currentY,
    sectionHeight + headerHeight + (rowHeights[0] ?? 0),
  );
  const pages: PdfTablePagePlan[] = [{ continuation: false, rowIndexes: [] }];
  let page = pages[0];
  let availableY = (startsOnNewPage ? pageTop : currentY) - sectionHeight - headerHeight;

  rowHeights.forEach((rowHeight, rowIndex) => {
    if (rowHeight > maximumRowHeight) {
      throw new Error("A PDF table row is taller than the printable page area.");
    }
    if (availableY - rowHeight < pageBottom) {
      page = { continuation: true, rowIndexes: [] };
      pages.push(page);
      availableY = pageTop - sectionHeight - headerHeight;
    }
    page.rowIndexes.push(rowIndex);
    availableY -= rowHeight;
  });

  return { pages, startsOnNewPage };
}

class ProcessPdfLayout {
  private page!: PDFPage;
  private y = PAGE_HEIGHT - MARGIN;
  private readonly regular: PDFFont;
  private readonly bold: PDFFont;
  private readonly document: PDFDocument;

  constructor(document: PDFDocument, regular: PDFFont, bold: PDFFont) {
    this.document = document;
    this.regular = regular;
    this.bold = bold;
    this.addPage();
  }

  private addPage() {
    this.page = this.document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
  }

  private ensureSpace(height: number) {
    if (shouldAddPdfPage(this.y, height)) this.addPage();
  }

  title(name: string, subtitle: string, logo: PDFImage) {
    const logoWidth = 128;
    const logoHeight = logo.height / logo.width * logoWidth;
    const titleLines = wrap(name, this.bold, 20, CONTENT_WIDTH - logoWidth - 38);
    const height = Math.max(68, 40 + titleLines.length * 23);
    this.ensureSpace(height);
    this.page.drawRectangle({ x: MARGIN, y: this.y - height, width: CONTENT_WIDTH, height, color: NAVY });
    this.page.drawRectangle({ x: MARGIN, y: this.y - 4, width: 72, height: 4, color: YELLOW });
    this.page.drawImage(logo, {
      x: MARGIN + CONTENT_WIDTH - logoWidth - 12,
      y: this.y - logoHeight - 14,
      width: logoWidth,
      height: logoHeight,
    });
    let cursor = this.y - 25;
    for (const line of titleLines) {
      this.page.drawText(line, { x: MARGIN + 12, y: cursor, size: 20, font: this.bold, color: WHITE });
      cursor -= 23;
    }
    this.page.drawText(pdfText(subtitle), { x: MARGIN + 12, y: this.y - height + 12, size: 8.5, font: this.regular, color: WHITE });
    this.y -= height + 10;
  }

  section(title: string) {
    this.ensureSpace(30);
    this.page.drawRectangle({ x: MARGIN, y: this.y - 22, width: CONTENT_WIDTH, height: 22, color: NAVY });
    this.page.drawRectangle({ x: MARGIN, y: this.y - 22, width: 5, height: 22, color: YELLOW });
    this.page.drawText(pdfText(title), { x: MARGIN + 11, y: this.y - 15, size: 9, font: this.bold, color: WHITE });
    this.y -= 28;
  }

  tableSection(title: string, headers: string[], rows: string[][], widths: number[]) {
    const fontSize = 7.4;
    const lineHeight = 9.2;
    const padding = 4;
    const headerHeight = 19;
    const normalizedRows = rows.length
      ? rows
      : [["No documentado", ...headers.slice(1).map(() => "")]];
    const measuredRows = normalizedRows.map((row) => {
      const cellLines = row.map((cell, index) =>
        wrap(text(cell), this.regular, fontSize, widths[index] - padding * 2),
      );
      return {
        cellLines,
        height: Math.max(...cellLines.map((lines) => lines.length)) * lineHeight + padding * 2,
      };
    });
    const plan = planPdfTablePages(this.y, measuredRows.map((row) => row.height));

    const drawSectionTitle = (continuation: boolean) => {
      const label = continuation ? title + " - continuación" : title;
      this.page.drawRectangle({ x: MARGIN, y: this.y - 22, width: CONTENT_WIDTH, height: 22, color: NAVY });
      this.page.drawRectangle({ x: MARGIN, y: this.y - 22, width: 5, height: 22, color: YELLOW });
      this.page.drawText(pdfText(label), { x: MARGIN + 11, y: this.y - 15, size: 9, font: this.bold, color: WHITE });
      this.y -= 28;
    };
    const drawHeader = () => {
      let x = MARGIN;
      headers.forEach((header, index) => {
        this.page.drawRectangle({ x, y: this.y - headerHeight, width: widths[index], height: headerHeight, color: LIGHT, borderColor: LINE, borderWidth: 0.6 });
        this.page.drawText(pdfText(header), { x: x + padding, y: this.y - 12.5, size: 6.5, font: this.bold, color: SLATE });
        x += widths[index];
      });
      this.y -= headerHeight;
    };

    if (plan.startsOnNewPage) this.addPage();
    plan.pages.forEach((plannedPage, pageIndex) => {
      if (pageIndex > 0) this.addPage();
      drawSectionTitle(plannedPage.continuation);
      drawHeader();
      plannedPage.rowIndexes.forEach((rowIndex) => {
        const measuredRow = measuredRows[rowIndex];
        let x = MARGIN;
        measuredRow.cellLines.forEach((lines, index) => {
          this.page.drawRectangle({ x, y: this.y - measuredRow.height, width: widths[index], height: measuredRow.height, color: WHITE, borderColor: LINE, borderWidth: 0.6 });
          lines.forEach((line, lineIndex) => {
            this.page.drawText(line, { x: x + padding, y: this.y - padding - fontSize - lineIndex * lineHeight, size: fontSize, font: this.regular, color: SLATE });
          });
          x += widths[index];
        });
        this.y -= measuredRow.height;
      });
    });
    this.y -= 9;
  }
  table(headers: string[], rows: string[][], widths: number[]) {
    const fontSize = 7.4;
    const lineHeight = 9.2;
    const padding = 4;
    const headerHeight = 19;
    const drawHeader = () => {
      this.ensureSpace(headerHeight + 12);
      let x = MARGIN;
      headers.forEach((header, index) => {
        this.page.drawRectangle({ x, y: this.y - headerHeight, width: widths[index], height: headerHeight, color: LIGHT, borderColor: LINE, borderWidth: 0.6 });
        this.page.drawText(pdfText(header), { x: x + padding, y: this.y - 12.5, size: 6.5, font: this.bold, color: SLATE });
        x += widths[index];
      });
      this.y -= headerHeight;
    };

    drawHeader();
    if (rows.length === 0) rows = [["No documentado", ...headers.slice(1).map(() => "")]];
    for (const row of rows) {
      const cellLines = row.map((cell, index) => wrap(text(cell), this.regular, fontSize, widths[index] - padding * 2));
      let offset = 0;
      const totalLines = Math.max(...cellLines.map((lines) => lines.length));
      while (offset < totalLines) {
        if (this.y < MARGIN + 42) {
          this.addPage();
          drawHeader();
        }
        const availableLines = Math.max(1, Math.floor((this.y - MARGIN - 20 - padding * 2) / lineHeight));
        const chunkLines = Math.min(totalLines - offset, availableLines);
        const rowHeight = chunkLines * lineHeight + padding * 2;
        if (this.y - rowHeight < MARGIN + 16) {
          this.addPage();
          drawHeader();
          continue;
        }
        let x = MARGIN;
        cellLines.forEach((lines, index) => {
          this.page.drawRectangle({ x, y: this.y - rowHeight, width: widths[index], height: rowHeight, color: WHITE, borderColor: LINE, borderWidth: 0.6 });
          lines.slice(offset, offset + chunkLines).forEach((line, lineIndex) => {
            this.page.drawText(line, { x: x + padding, y: this.y - padding - fontSize - lineIndex * lineHeight, size: fontSize, font: this.regular, color: SLATE });
          });
          x += widths[index];
        });
        this.y -= rowHeight;
        offset += chunkLines;
        if (offset < totalLines) {
          this.addPage();
          drawHeader();
        }
      }
    }
    this.y -= 9;
  }

  finish() {
    const pages = this.document.getPages();
    pages.forEach((page, index) => {
      page.drawText("Ficha de proceso - " + (index + 1) + "/" + pages.length, {
        x: MARGIN,
        y: 22,
        size: 7,
        font: this.regular,
        color: SLATE,
      });
    });
  }
}

export function processPdfFilename(process: ProcessMasterDto) {
  const identity = process.process.processCode || process.process.id?.slice(0, 8) || "sin-codigo";
  const safe = (identity + "_" + process.process.name)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 90);
  return "Ficha_Proceso_" + (safe || "proceso") + ".pdf";
}

export async function generateProcessPdf(process: ProcessMasterDto) {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const logo = await document.embedPng(await readFile(join(cwd(), "public", "mcparking-logo-pdf.png")));
  const layout = new ProcessPdfLayout(document, regular, bold);

  layout.title(process.process.name, [
    processStatus(process.process.status),
    processType(process.process.process_type),
    text(process.process.company_name, "Sin empresa"),
  ].join(" | "), logo);
  layout.table(
    ["CAMPO", "VALOR", "CAMPO", "VALOR"],
    [
      ["Dueño del proceso", text(process.responsibility.owner_role_name, "Sin rol dueño"), "Persona actual", text(process.responsibility.owner_person_name, "Sin persona asignada")],
      ["Código", text(process.process.processCode, "Sin código"), "Última edición", documentaryDate(process.process.masterUpdatedAt ?? process.process.createdAt)],
    ],
    [92, 164, 92, CONTENT_WIDTH - 348],
  );

  layout.tableSection("1. PROPOSITO Y ALCANCE", ["CAMPO", "CONTENIDO"], [
    ["Propósito", text(process.process.objective)],
    ["Inicio", text(process.process.processStart)],
    ["Fin", text(process.process.processEnd)],
    ["Alcance", text(process.process.scope)],
  ], [105, CONTENT_WIDTH - 105]);

  const activities = process.stages
    .map((stage, index) => String(stage.sort_order ?? index + 1) + ". " + stage.name)
    .join("\n");
  layout.tableSection(
    "2. ENTRADAS, ACTIVIDADES Y SALIDAS",
    ["PROVEEDOR / ORIGEN", "ENTRADAS", "ACTIVIDADES CLAVE", "SALIDAS", "CLIENTE / DESTINO"],
    [[
      text(process.process.supplier_origin),
      text(process.process.process_inputs),
      text(activities, "Sin actividades activas"),
      text(process.process.process_outputs),
      text(process.process.client_destination),
    ]],
    [85, 85, 170, 85, CONTENT_WIDTH - 425],
  );

  layout.tableSection("3. ROLES, RESPONSABILIDADES Y AUTORIDAD", ["ROL", "RESPONSABILIDAD", "AUTORIDAD", "RENDICION DE CUENTAS"], process.roleProfiles.map((profile) => [
    profile.role_name,
    text(profile.responsibility),
    text(profile.authority),
    text(profile.accountability),
  ]), [112, 133, 126, CONTENT_WIDTH - 371]);

  const metrics = process.metrics.length
    ? process.metrics
    : process.process.basic_kpi
      ? [{ name: process.process.basic_kpi, formula: null, target: null, frequency: null, responsible_roles: [] }]
      : [];
  layout.tableSection("4. INDICADORES Y OBJETIVOS", ["INDICADOR", "FORMULA / CRITERIO", "META", "FRECUENCIA", "RESPONSABLE(S)"], metrics.map((metric) => [
    metric.name,
    text(metric.formula),
    text(metric.target),
    text(metric.frequency),
    text(metric.responsible_roles.map((role) => role.role_name).join(", ")),
  ]), [112, 112, 78, 78, CONTENT_WIDTH - 380]);

  const riskRows = process.risks.flatMap((risk) =>
    risk.controls.length
      ? risk.controls.map((control) => [
          (risk.risk_type === "opportunity" ? "Oportunidad: " : "Riesgo: ") + risk.name,
          text(control.name),
          text(control.evidence),
          text(control.responsible_roles.map((role) => role.role_name).join(", ")),
        ])
      : [[(risk.risk_type === "opportunity" ? "Oportunidad: " : "Riesgo: ") + risk.name, "No documentado", "No documentado", "No documentado"]],
  );
  layout.tableSection("5. RIESGOS, CONTROLES Y OPORTUNIDADES", ["RIESGO / OPORTUNIDAD", "CONTROL", "EVIDENCIA", "RESPONSABLE(S)"], riskRows, [142, 126, 112, CONTENT_WIDTH - 380]);

  layout.finish();
  return document.save();
}