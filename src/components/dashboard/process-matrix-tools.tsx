"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Download, Filter, X } from "lucide-react";

import { Badge, TypedBadge, ValueBadge, type BadgeTone } from "@/components/dashboard/badge";
import { EmptyState } from "@/components/dashboard/data-table";
import type { ProcessMatrixRow } from "@/lib/dashboard/data";

function value(value: string | null | undefined) {
  return value && value.length > 0 ? value : "Sin datos";
}

function csvEscape(cell: string | number | null | undefined) {
  const text = String(cell ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function uniqueOptions(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map(value).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "es"),
  );
}

function splitList(value: string | null | undefined) {
  if (!value) {
    return [];
  }

  return value
    .split(/, |\|/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatPercent(value: number | null) {
  if (value === null) {
    return "Sin datos";
  }

  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

function impactTone(value: number | null): BadgeTone {
  if (value === null) {
    return "neutral";
  }

  if (value >= 25) {
    return "danger";
  }

  if (value >= 15) {
    return "warning";
  }

  if (value > 0) {
    return "info";
  }

  return "neutral";
}

function CompactValue({ value: rawValue }: { value: string | null | undefined }) {
  if (!rawValue || rawValue === "No definido") {
    return <ValueBadge tone="neutral">Sin datos</ValueBadge>;
  }

  return <span>{rawValue}</span>;
}

function ChipList({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <ValueBadge tone="neutral">Sin datos</ValueBadge>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          className="rounded-md bg-[#edf8fd] px-2 py-1 text-xs font-semibold text-navy"
          key={item}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function BackupBadge({ person, role }: { person: string | null; role: string | null }) {
  if (person) {
    return <Badge tone="success">Cubierto</Badge>;
  }

  if (role) {
    return <Badge tone="warning">Rol sin persona</Badge>;
  }

  return <Badge tone="danger">Sin respaldo</Badge>;
}

export function ProcessMatrixTools({ rows }: { rows: ProcessMatrixRow[] }) {
  const [stage, setStage] = useState("todos");
  const [role, setRole] = useState("todos");
  const [person, setPerson] = useState("todos");
  const [criticality, setCriticality] = useState("todos");
  const [system, setSystem] = useState("todos");

  const stageOptions = useMemo(() => uniqueOptions(rows.map((row) => row.subprocess_name)), [rows]);
  const roleOptions = useMemo(
    () =>
      uniqueOptions(
        rows.flatMap((row) => [
          row.owner_role_name,
          row.user_role_name,
          row.support_role_name,
          row.backup_role_name,
        ]),
      ),
    [rows],
  );
  const personOptions = useMemo(
    () =>
      uniqueOptions(
        rows.flatMap((row) => [
          row.owner_person_name,
          row.user_person_name,
          row.support_person_name,
          row.backup_person_name,
        ]),
      ),
    [rows],
  );
  const criticalityOptions = useMemo(
    () => uniqueOptions(rows.map((row) => row.criticality)),
    [rows],
  );
  const systemOptions = useMemo(
    () => uniqueOptions(rows.flatMap((row) => splitList(row.systems))),
    [rows],
  );

  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        const rowRoles = [
          row.owner_role_name,
          row.user_role_name,
          row.support_role_name,
          row.backup_role_name,
        ].map(value);
        const rowPeople = [
          row.owner_person_name,
          row.user_person_name,
          row.support_person_name,
          row.backup_person_name,
        ].map(value);
        const rowSystems = splitList(row.systems);

        return (
          (stage === "todos" || row.subprocess_name === stage) &&
          (role === "todos" || rowRoles.includes(role)) &&
          (person === "todos" || rowPeople.includes(person)) &&
          (criticality === "todos" || row.criticality === criticality) &&
          (system === "todos" || rowSystems.includes(system))
        );
      }),
    [criticality, person, role, rows, stage, system],
  );

  const hasFilters =
    stage !== "todos" ||
    role !== "todos" ||
    person !== "todos" ||
    criticality !== "todos" ||
    system !== "todos";

  function clearFilters() {
    setStage("todos");
    setRole("todos");
    setPerson("todos");
    setCriticality("todos");
    setSystem("todos");
  }

  function downloadExcel() {
    const headers = [
      "Proceso",
      "Subproceso",
      "Empresa proceso",
      "Rol dueño",
      "Empresa rol dueño",
      "Persona dueña",
      "Rol usuario",
      "Empresa rol usuario",
      "Persona usuario",
      "Rol apoyo",
      "Empresa rol apoyo",
      "Persona apoyo",
      "Impacto %",
      "Criticidad",
      "Respaldo",
      "Sistemas",
      "Riesgo",
      "Control",
    ];
    const lines = [
      headers.map(csvEscape).join(";"),
      ...filteredRows.map((row) =>
        [
          row.process_name,
          row.subprocess_name,
          value(row.owner_company_name),
          value(row.owner_role_name),
          value(row.owner_role_company_name),
          value(row.owner_person_name),
          value(row.user_role_name),
          value(row.user_role_company_name),
          value(row.user_person_name),
          value(row.support_role_name),
          value(row.support_role_company_name),
          value(row.support_person_name),
          row.impact_percent ?? "",
          row.criticality,
          `${value(row.backup_role_name)}${row.backup_person_name ? ` (${row.backup_person_name})` : ""}`,
          value(row.systems),
          value(row.risks),
          value(row.controls),
        ]
          .map(csvEscape)
          .join(";"),
      ),
    ];
    const blob = new Blob([`\uFEFF${lines.join("\n")}`], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "matriz-tecnica-proceso.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="border-t border-line px-5 pb-5">
      <div className="mt-5 rounded-lg border border-line bg-mist p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-navy">
              <Filter className="h-4 w-4 text-sea" />
              Filtros de matriz
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {filteredRows.length} de {rows.length} filas visibles.
            </p>
          </div>

          <div className="grid flex-1 gap-2 sm:grid-cols-2 xl:grid-cols-6">
            <MatrixSelect label="Etapa" onChange={setStage} options={stageOptions} value={stage} />
            <MatrixSelect label="Rol" onChange={setRole} options={roleOptions} value={role} />
            <MatrixSelect label="Persona" onChange={setPerson} options={personOptions} value={person} />
            <MatrixSelect
              label="Criticidad"
              onChange={setCriticality}
              options={criticalityOptions}
              value={criticality}
            />
            <MatrixSelect label="Sistema" onChange={setSystem} options={systemOptions} value={system} />
            <div className="flex gap-2 self-end">
              {hasFilters ? (
                <button
                  className="inline-flex h-10 items-center justify-center rounded-md border border-line bg-white px-3 text-sm font-bold text-navy transition hover:border-sea hover:bg-white"
                  onClick={clearFilters}
                  title="Limpiar filtros"
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
              <button
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md bg-navy px-3 text-sm font-bold text-white transition hover:bg-sea"
                onClick={downloadExcel}
                type="button"
              >
                <Download className="h-4 w-4" />
                Excel
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5">
        {filteredRows.length === 0 ? (
          <EmptyState description="Prueba limpiando filtros o seleccionando otro criterio." />
        ) : (
          <section className="overflow-hidden rounded-lg border border-line bg-white">
            <div className="hidden grid-cols-[minmax(220px,1.5fr)_minmax(190px,1.1fr)_150px_96px_110px_82px] gap-4 border-b border-line bg-[#f6f9fb] px-4 py-3 text-xs font-bold uppercase tracking-[0.08em] text-slate-500 lg:grid">
              <span>Etapa</span>
              <span>Responsable</span>
              <span>Respaldo</span>
              <span className="text-right">Impacto</span>
              <span>Criticidad</span>
              <span className="text-right">Detalle</span>
            </div>

            <div className="divide-y divide-line">
              {filteredRows.map((row) => (
                <MatrixRowCard key={row.subprocess_id} row={row} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function MatrixRowCard({ row }: { row: ProcessMatrixRow }) {
  return (
    <details className="group bg-white transition open:bg-[#fbfcfd]">
      <summary className="grid cursor-pointer list-none gap-3 px-4 py-4 hover:bg-[#f6f9fb] lg:grid-cols-[minmax(220px,1.5fr)_minmax(190px,1.1fr)_150px_96px_110px_82px] lg:items-center">
        <div>
          <p className="font-bold leading-5 text-navy">{row.subprocess_name}</p>
          <p className="mt-1 text-xs text-slate-500">Empresa: {value(row.owner_company_name)}</p>
        </div>

        <RoleSummary person={row.owner_person_name} role={row.owner_role_name} />

        <div className="space-y-1">
          <BackupBadge person={row.backup_person_name} role={row.backup_role_name} />
          <p className="text-xs text-slate-500">
            {row.backup_person_name ? row.backup_person_name : value(row.backup_role_name)}
          </p>
        </div>

        <div className="lg:text-right">
          <ValueBadge tone={impactTone(row.impact_percent)}>{formatPercent(row.impact_percent)}</ValueBadge>
        </div>

        <TypedBadge type="criticality" value={row.criticality} />

        <div className="flex items-center gap-2 text-sm font-bold text-sea lg:justify-end">
          Ver
          <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
        </div>
      </summary>

      <div className="border-t border-line bg-mist px-4 py-4">
        <div className="grid gap-3 lg:grid-cols-3">
          <DetailBlock title="Roles relacionados">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <RoleSummary label="Usuario" person={row.user_person_name} role={row.user_role_name} />
              <RoleSummary label="Apoyo" person={row.support_person_name} role={row.support_role_name} />
            </div>
          </DetailBlock>

          <DetailBlock title="Sistemas">
            <ChipList items={splitList(row.systems)} />
          </DetailBlock>

          <DetailBlock title="Riesgo y control">
            <div className="space-y-3">
              <div>
                <p className="mb-1 text-xs font-bold uppercase tracking-[0.08em] text-slate-500">Riesgo</p>
                <ChipList items={splitList(row.risks)} />
              </div>
              <div>
                <p className="mb-1 text-xs font-bold uppercase tracking-[0.08em] text-slate-500">Control</p>
                <ChipList items={splitList(row.controls)} />
              </div>
            </div>
          </DetailBlock>
        </div>
      </div>
    </details>
  );
}

function DetailBlock({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="rounded-lg border border-line bg-white p-3">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.1em] text-slate-500">{title}</h3>
      {children}
    </section>
  );
}

function RoleSummary({
  label,
  person,
  role,
}: {
  label?: string;
  person: string | null;
  role: string | null;
}) {
  const hasRole = role && role !== "No definido";
  const hasPerson = person && person !== "No definido";

  return (
    <div className="min-w-0 space-y-1">
      {label ? <p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">{label}</p> : null}
      <p className="break-words font-semibold text-navy">
        {hasRole ? role : <ValueBadge tone="neutral">Sin rol</ValueBadge>}
      </p>
      <p className="text-xs text-slate-500">
        {hasPerson ? (
          <span>{person}</span>
        ) : (
          <ValueBadge tone={hasRole ? "warning" : "neutral"}>{hasRole ? "Sin persona" : "Sin datos"}</ValueBadge>
        )}
      </p>
    </div>
  );
}

function MatrixSelect({
  label,
  onChange,
  options,
  value: selectedValue,
}: {
  label: string;
  onChange: (value: string) => void;
  options: string[];
  value: string;
}) {
  return (
    <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
      {label}
      <select
        className="mt-1 h-10 w-full rounded-md border border-line bg-white px-3 text-sm font-semibold normal-case tracking-normal text-navy outline-none transition focus:border-sea focus:ring-2 focus:ring-[#d8eef4]"
        onChange={(event) => onChange(event.target.value)}
        value={selectedValue}
      >
        <option value="todos">Todos</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
