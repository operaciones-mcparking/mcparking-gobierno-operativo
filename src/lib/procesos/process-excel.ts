import ExcelJS from "exceljs";

import type { ProcessMasterDto } from "@/app/procesos/process-master/process-master-types";

const HEADER_FILL = "023574";
const HEADER_TEXT = "FFFFFF";
const BORDER_COLOR = "CBD8E3";

const processTypeLabels: Record<ProcessMasterDto["process"]["process_type"], string> = {
  operational: "Operativo / Clave",
  strategic: "Estratégico",
  support: "Soporte",
};

const processStatusLabels: Record<ProcessMasterDto["process"]["status"], string> = {
  active: "Vigente",
  archived: "Archivado",
  inactive: "Borrador",
};

function text(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function responsibleRoles(roles: Array<{ role_name: string; sort_order: number }>) {
  return [...roles]
    .sort((left, right) => left.sort_order - right.sort_order || left.role_name.localeCompare(right.role_name, "es"))
    .map((role) => role.role_name)
    .join("; ");
}

function excelDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date;
}

function configureSheet(worksheet: ExcelJS.Worksheet) {
  const lastColumn = worksheet.columnCount;
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.autoFilter = {
    from: { column: 1, row: 1 },
    to: { column: lastColumn, row: 1 },
  };
  worksheet.getRow(1).height = 26;
  worksheet.getRow(1).eachCell((cell) => {
    cell.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
    cell.fill = { fgColor: { argb: HEADER_FILL }, pattern: "solid", type: "pattern" };
    cell.font = { bold: true, color: { argb: HEADER_TEXT } };
  });
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) row.height = 30;
    row.eachCell((cell) => {
      cell.alignment = { vertical: "top", wrapText: true };
      cell.border = {
        bottom: { color: { argb: BORDER_COLOR }, style: "thin" },
      };
    });
  });
}

function addSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  columns: Array<{ header: string; key: string; width: number }>,
  rows: Array<Record<string, Date | number | string>>,
) {
  const worksheet = workbook.addWorksheet(name);
  worksheet.columns = columns;
  worksheet.addRows(rows);
  configureSheet(worksheet);
  return worksheet;
}

function compareProcesses(left: ProcessMasterDto, right: ProcessMasterDto) {
  return text(left.process.processCode).localeCompare(text(right.process.processCode), "es", { numeric: true }) ||
    left.process.name.localeCompare(right.process.name, "es");
}

export async function generateProcessMasterExcel(source: ProcessMasterDto[]) {
  const processes = [...source].sort(compareProcesses);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "McParking";
  workbook.created = new Date();

  const processSheet = addSheet(workbook, "Procesos", [
    { header: "Código", key: "code", width: 16 },
    { header: "Proceso", key: "process", width: 34 },
    { header: "Estado", key: "status", width: 14 },
    { header: "Empresa", key: "company", width: 20 },
    { header: "Tipo de proceso", key: "processType", width: 20 },
    { header: "Tipo de operación", key: "operationType", width: 20 },
    { header: "Rol dueño", key: "ownerRole", width: 25 },
    { header: "Persona actual", key: "ownerPerson", width: 24 },
    { header: "Propósito", key: "purpose", width: 38 },
    { header: "Inicio", key: "start", width: 30 },
    { header: "Fin", key: "end", width: 30 },
    { header: "Alcance", key: "scope", width: 38 },
    { header: "Proveedor / Origen", key: "supplier", width: 28 },
    { header: "Entradas", key: "inputs", width: 34 },
    { header: "Salidas", key: "outputs", width: 34 },
    { header: "Cliente / Destino", key: "client", width: 28 },
    { header: "Cantidad de etapas", key: "stageCount", width: 19 },
    { header: "Última edición", key: "updatedAt", width: 18 },
  ], processes.map((item) => ({
    client: text(item.process.client_destination),
    code: text(item.process.processCode),
    company: text(item.process.company_name),
    end: text(item.process.processEnd),
    inputs: text(item.process.process_inputs),
    operationType: text(item.process.area_name),
    outputs: text(item.process.process_outputs),
    ownerPerson: text(item.responsibility.owner_person_name) || "Sin persona asignada",
    ownerRole: text(item.responsibility.owner_role_name) || "Sin rol dueño",
    process: item.process.name,
    processType: processTypeLabels[item.process.process_type],
    purpose: text(item.process.objective),
    scope: text(item.process.scope),
    stageCount: item.stages.length,
    start: text(item.process.processStart),
    status: processStatusLabels[item.process.status],
    supplier: text(item.process.supplier_origin),
    updatedAt: excelDate(item.process.masterUpdatedAt ?? item.process.createdAt),
  })));
  processSheet.getColumn("updatedAt").numFmt = "dd-mm-yyyy";

  addSheet(workbook, "Etapas", [
    { header: "Código proceso", key: "code", width: 16 },
    { header: "Proceso", key: "process", width: 34 },
    { header: "Nº etapa", key: "order", width: 12 },
    { header: "Etapa", key: "stage", width: 32 },
    { header: "Descripción", key: "description", width: 50 },
  ], processes.flatMap((item) => [...item.stages]
    .sort((left, right) => left.sort_order - right.sort_order || left.name.localeCompare(right.name, "es"))
    .map((stage) => ({
      code: text(item.process.processCode),
      description: text(stage.description),
      order: stage.sort_order,
      process: item.process.name,
      stage: stage.name,
    }))));

  addSheet(workbook, "Roles y responsabilidades", [
    { header: "Código proceso", key: "code", width: 16 },
    { header: "Proceso", key: "process", width: 34 },
    { header: "Orden", key: "order", width: 10 },
    { header: "Rol", key: "role", width: 28 },
    { header: "Responsabilidad", key: "responsibility", width: 44 },
    { header: "Autoridad", key: "authority", width: 44 },
    { header: "Rendición de cuentas", key: "accountability", width: 44 },
  ], processes.flatMap((item) => [...item.roleProfiles]
    .sort((left, right) => left.sort_order - right.sort_order || left.id.localeCompare(right.id))
    .map((profile) => ({
      accountability: text(profile.accountability),
      authority: text(profile.authority),
      code: text(item.process.processCode),
      order: profile.sort_order,
      process: item.process.name,
      responsibility: text(profile.responsibility),
      role: profile.role_name,
    }))));

  addSheet(workbook, "Indicadores", [
    { header: "Código proceso", key: "code", width: 16 },
    { header: "Proceso", key: "process", width: 34 },
    { header: "Indicador", key: "metric", width: 32 },
    { header: "Fórmula / criterio", key: "formula", width: 40 },
    { header: "Meta", key: "target", width: 24 },
    { header: "Frecuencia", key: "frequency", width: 18 },
    { header: "Responsables", key: "responsibles", width: 36 },
  ], processes.flatMap((item) => [...item.metrics]
    .sort((left, right) => left.sort_order - right.sort_order || left.name.localeCompare(right.name, "es"))
    .map((metric) => ({
      code: text(item.process.processCode),
      formula: text(metric.formula),
      frequency: text(metric.frequency),
      metric: metric.name,
      process: item.process.name,
      responsibles: responsibleRoles(metric.responsible_roles),
      target: text(metric.target),
    }))));

  addSheet(workbook, "Riesgos y controles", [
    { header: "Código proceso", key: "code", width: 16 },
    { header: "Proceso", key: "process", width: 34 },
    { header: "Tipo", key: "type", width: 16 },
    { header: "Riesgo / oportunidad", key: "risk", width: 38 },
    { header: "Control", key: "control", width: 38 },
    { header: "Evidencia", key: "evidence", width: 36 },
    { header: "Responsables", key: "responsibles", width: 36 },
  ], processes.flatMap((item) => item.risks.flatMap((risk) => {
    const base = {
      code: text(item.process.processCode),
      process: item.process.name,
      risk: risk.name,
      type: risk.risk_type === "opportunity" ? "Oportunidad" : "Riesgo",
    };
    return risk.controls.length
      ? risk.controls.map((control) => ({
          ...base,
          control: control.name,
          evidence: text(control.evidence),
          responsibles: responsibleRoles(control.responsible_roles),
        }))
      : [{ ...base, control: "", evidence: "", responsibles: "" }];
  })));

  return workbook.xlsx.writeBuffer();
}

export function processMasterExcelFilename(date = new Date()) {
  const day = date.toISOString().slice(0, 10);
  return `Maestro_de_Procesos_${day}.xlsx`;
}