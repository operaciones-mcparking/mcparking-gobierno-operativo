"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Archive, GripVertical, HelpCircle, PlusCircle, Save } from "lucide-react";

import {
  addSubprocessToProcess,
  deleteSubprocess,
  reorderSubprocesses,
  updateSubprocessDetail,
  updateSubprocessImpacts,
} from "@/app/admin/actions";
import { Badge, criticalityOptions, TypedBadge, ValueBadge } from "@/components/dashboard/badge";
import type { RoleDictionaryItem } from "@/lib/dashboard/data";

type StageRow = {
  process_id: string;
  subprocess_id: string;
  subprocess_name: string;
  subprocess_description: string | null;
  sort_order: number | null;
  criticality: string;
  owner_role_name: string | null;
  owner_person_name: string | null;
  user_role_name: string | null;
  user_person_name: string | null;
  support_role_name: string | null;
  support_person_name: string | null;
  impact_percent: number | null;
  backup_role_name: string | null;
  backup_person_name: string | null;
  systems: string | null;
  risks: string | null;
  controls: string | null;
};

type RoleOption = {
  currentPersonName: string | null;
  id: string;
  level: string | null;
  name: string;
  roleCode: string | null;
};

type System = {
  id: string;
  name: string;
};

const inputClass =
  "w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none transition focus:border-sea focus:ring-2 focus:ring-[#e6edf3]";

const roleHelp = {
  owner: "Rol responsable de que la etapa exista, funcione y tenga seguimiento.",
  user: "Rol que usa la salida de esta etapa o depende de ella para continuar el proceso.",
  support: "Rol que apoya, entrega informacion o participa sin ser el responsable principal.",
  backup: "Rol que puede cubrir la etapa si el rol dueno o la persona asignada no esta disponible.",
};

function RoleLabel({
  children,
  help,
}: {
  children: React.ReactNode;
  help: string;
}) {
  return (
    <span className="inline-flex items-center gap-1" title={help}>
      {children}
      <HelpCircle className="h-3.5 w-3.5 text-slate-400" />
    </span>
  );
}

function Field({
  children,
  help,
  label,
}: {
  children: React.ReactNode;
  help?: string;
  label: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-600">
        {help ? <RoleLabel help={help}>{label}</RoleLabel> : label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function PrimaryButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      className="inline-flex items-center justify-center gap-2 rounded-md bg-navy px-4 py-2 text-sm font-bold text-white transition hover:bg-[#075077]"
      type="submit"
    >
      <Save className="h-4 w-4 text-clay" />
      {children}
    </button>
  );
}

function RoleSelect({
  defaultPersonName,
  defaultRole,
  name,
  roles,
}: {
  defaultPersonName?: string | null;
  defaultRole: string | null;
  name: string;
  roles: RoleOption[];
}) {
  const defaultRoleId = roles.find((role) => role.name === defaultRole)?.id ?? "";
  const [selectedRoleId, setSelectedRoleId] = useState(defaultRoleId);
  const selectedRole = roles.find((role) => role.id === selectedRoleId);
  const personName = selectedRole?.currentPersonName ?? defaultPersonName ?? null;

  return (
    <div>
      <select
        className={inputClass}
        defaultValue={defaultRoleId}
        name={name}
        onChange={(event) => setSelectedRoleId(event.target.value)}
      >
        <option value="">No definido</option>
        {roles.map((role) => (
          <option key={role.id} value={role.id}>
            {role.name}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs leading-5 text-slate-500">
        Persona actual: <span className="font-semibold text-navy">{personName ?? "Sin persona asignada"}</span>
      </p>
    </div>
  );
}

function roleTone(level: string | null) {
  if (level === "directivo" || level === "executive" || level === "board") return "info";
  if (level === "gerencial" || level === "jefatura" || level === "strategic" || level === "tactical") return "warning";
  return "success";
}

function roleLevelLabel(level: string | null) {
  if (level === "directivo") return "Directivo";
  if (level === "gerencial") return "Gerencial";
  if (level === "jefatura") return "Jefatura";
  if (level === "analista") return "Analista";
  if (level === "executive") return "Ejecutivo";
  if (level === "strategic") return "Estrategico";
  if (level === "tactical") return "Tactico";
  if (level === "board") return "Directorio";
  return "Operativo";
}

function uniqueRoleOptions(dictionary: RoleDictionaryItem[]) {
  const byId = new Map<string, RoleOption>();

  for (const role of dictionary) {
    if (role.role_status !== "active" || byId.has(role.role_id)) {
      continue;
    }

    byId.set(role.role_id, {
      currentPersonName: role.current_person_name,
      id: role.role_id,
      level: role.role_level,
      name: role.role_name,
      roleCode: role.role_code,
    });
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
}

function RoleDictionary({
  dictionary,
  roles,
}: {
  dictionary: RoleDictionaryItem[];
  roles: RoleOption[];
}) {
  const activeRoleIds = new Set(roles.map((role) => role.id));

  return (
    <section className="rounded-xl border border-line bg-white">
      <div className="flex flex-col justify-between gap-2 border-b border-line px-4 py-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-sm font-medium text-navy">Diccionario de roles oficial</h3>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            Los selectores usan solo roles oficiales activos. La persona actual se deriva del rol.
          </p>
        </div>
        <span className="text-xs text-slate-500">{roles.length} roles activos</span>
      </div>

      {roles.length === 0 ? (
        <div className="p-4 text-sm text-slate-600">
          Todavia no hay roles oficiales activos disponibles para asociar etapas.
        </div>
      ) : (
        <div className="grid gap-2 p-3 md:grid-cols-2 xl:grid-cols-4">
          {dictionary
            .filter((role) => activeRoleIds.has(role.role_id))
            .map((role) => (
              <details
                className="group rounded-lg border border-line bg-[#fbfcfd] p-3 transition open:bg-white"
                key={role.role_id}
              >
                <summary className="cursor-pointer list-none">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-sm font-medium text-navy">{role.role_name}</p>
                        <Badge tone={roleTone(role.role_level)}>{roleLevelLabel(role.role_level)}</Badge>
                      </div>
                      <p className="mt-1 truncate text-xs text-slate-600">
                        Persona actual:{" "}
                        <span className="font-medium text-navy">
                          {role.current_person_name ?? "Sin persona"}
                        </span>
                      </p>
                    </div>
                    <ValueBadge tone="success">{role.role_code ?? "Sin codigo"}</ValueBadge>
                  </div>
                </summary>

                <div className="mt-3 border-t border-line pt-3">
                  <p className="text-xs leading-5 text-slate-700">
                    {role.role_description ?? "Sin descripcion registrada."}
                  </p>
                  <div className="mt-3">
                    <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-slate-500">
                      Responsabilidades
                    </p>
                    <ul className="mt-2 space-y-1.5 text-xs leading-5 text-slate-700">
                      {(role.responsibilities ?? []).slice(0, 3).map((responsibility) => (
                        <li className="flex gap-2" key={responsibility}>
                          <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-sea" />
                          <span>{responsibility}</span>
                        </li>
                      ))}
                      {(role.responsibilities ?? []).length === 0 ? (
                        <li className="text-slate-500">Sin responsabilidades registradas.</li>
                      ) : null}
                    </ul>
                  </div>
                </div>
              </details>
            ))}
        </div>
      )}
    </section>
  );
}

function splitList(value: string | null) {
  if (!value) {
    return [];
  }

  return value
    .split(/, |\|/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function firstListItem(value: string | null) {
  return splitList(value)[0] ?? "";
}

function SystemChecklist({
  defaultNames = [],
  systems,
}: {
  defaultNames?: string[];
  systems: System[];
}) {
  if (systems.length === 0) {
    return (
      <p className="rounded-md border border-line bg-white px-3 py-2 text-sm text-slate-500">
        No hay sistemas cargados todavia.
      </p>
    );
  }

  return (
    <div className="grid gap-2 rounded-md border border-line bg-white p-3 sm:grid-cols-2 lg:grid-cols-3">
      {systems.map((system) => (
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700" key={system.id}>
          <input
            className="h-4 w-4 rounded border-line text-sea"
            defaultChecked={defaultNames.includes(system.name)}
            name="system_ids"
            type="checkbox"
            value={system.id}
          />
          {system.name}
        </label>
      ))}
    </div>
  );
}

function moveItem(items: StageRow[], fromIndex: number, toIndex: number) {
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);

  return next.map((item, index) => ({
    ...item,
    sort_order: index + 1,
  }));
}

function parseImpact(value: string) {
  if (value.trim() === "") {
    return null;
  }

  const number = Number(value);

  if (Number.isNaN(number)) {
    return null;
  }

  return Math.max(0, Math.min(100, number));
}

export function StageEditor({
  initialRows,
  nextSortOrder,
  processId,
  roleDictionary,
  systems,
}: {
  initialRows: StageRow[];
  nextSortOrder: number;
  processId: string;
  roleDictionary: RoleDictionaryItem[];
  systems: System[];
}) {
  const roleOptions = useMemo(() => uniqueRoleOptions(roleDictionary), [roleDictionary]);
  const [rows, setRows] = useState(initialRows);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const impactBaselineRef = useRef<StageRow[] | null>(null);
  const impactTotal = rows.reduce((total, item) => total + (item.impact_percent ?? 0), 0);

  function saveOrder(nextRows: StageRow[]) {
    setMessage("Guardando orden...");
    startTransition(async () => {
      const result = await reorderSubprocesses(
        processId,
        nextRows.map((row) => row.subprocess_id),
      );
      setMessage(result.error ? result.error : "Orden actualizado");
    });
  }

  function saveImpacts(nextRows: StageRow[]) {
    setMessage("Guardando impactos...");
    startTransition(async () => {
      const result = await updateSubprocessImpacts(
        processId,
        nextRows.map((row) => ({
          subprocessId: row.subprocess_id,
          impactPercent: row.impact_percent,
        })),
      );
      setMessage(result.error ? result.error : "Impactos actualizados");
    });
  }

  function handleImpactChange(index: number, value: string) {
    const baseline = impactBaselineRef.current ?? rows;
    const nextRows = baseline.map((item, itemIndex) =>
      itemIndex === index ? { ...item, impact_percent: parseImpact(value) } : item,
    );
    setRows(nextRows);
  }

  function handleImpactBlur() {
    impactBaselineRef.current = null;
    saveImpacts(rows);
  }

  function handleImpactFocus() {
    impactBaselineRef.current = rows;
  }

  function handleDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      return;
    }

    const nextRows = moveItem(rows, dragIndex, targetIndex);
    setRows(nextRows);
    setDragIndex(null);
    saveOrder(nextRows);
  }

  return (
    <section className="mt-5 rounded-lg border border-line bg-white shadow-[0_10px_30px_rgba(0,59,92,0.06)]">
      <div className="border-b border-line px-5 py-4">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-xl font-bold text-navy">Etapas / subprocesos</h2>
            <p className="mt-1 text-sm text-slate-600">
              Completa estructura, criticidad, impacto y roles oficiales sin activar el proceso.
            </p>
          </div>
          <div className="text-sm sm:text-right">
            <p className="font-semibold text-sea">{isPending ? "Guardando..." : message}</p>
            <p className="font-semibold text-navy">Impacto total actual: {impactTotal}%</p>
            {rows.length > 0 && impactTotal !== 100 ? (
              <p className="text-xs font-medium text-[#86510d]">La suma de impactos es distinta de 100%.</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="space-y-3 px-5 py-5">
        <RoleDictionary dictionary={roleDictionary} roles={roleOptions} />

        <details className="rounded-lg border border-line bg-white">
          <summary className="cursor-pointer list-none px-4 py-3">
            <div className="flex items-center gap-2 font-bold text-navy">
              <PlusCircle className="h-4 w-4 text-sea" />
              Agregar nueva etapa
            </div>
          </summary>
          <form action={addSubprocessToProcess} className="grid gap-4 border-t border-line p-4">
            <input name="process_id" type="hidden" value={processId} />
            <input name="sort_order" type="hidden" value={nextSortOrder} />

            <div className="rounded-lg border border-line bg-mist p-4">
              <h3 className="font-bold text-navy">1. Datos de la etapa</h3>
              <div className="mt-4 grid gap-4">
                <Field label="Nombre etapa">
                  <input className={inputClass} name="name" required />
                </Field>
                <Field label="Descripcion">
                  <textarea className={`${inputClass} min-h-24`} name="description" />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Frecuencia">
                    <input className={inputClass} name="frequency" />
                  </Field>
                  <Field label="Criticidad">
                    <select className={inputClass} name="criticality" defaultValue="medium">
                      {criticalityOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-line bg-mist p-4">
              <h3 className="font-bold text-navy">2. Peso dentro del proceso</h3>
              <p className="mt-1 text-sm text-slate-600">
                El impacto puede quedar vacio mientras el proceso siga como borrador.
              </p>
              <Field label="Impacto %">
                <input className={inputClass} max={100} min={0} name="impact_percent" type="number" />
              </Field>
            </div>

            <div className="rounded-lg border border-line bg-mist p-4">
              <h3 className="font-bold text-navy">3. Roles asociados</h3>
              <div className="mt-4 grid gap-4 lg:grid-cols-4">
                <Field label="Rol dueno" help={roleHelp.owner}>
                  <RoleSelect defaultRole={null} name="owner_role_id" roles={roleOptions} />
                </Field>
                <Field label="Rol usuario" help={roleHelp.user}>
                  <RoleSelect defaultRole={null} name="user_role_id" roles={roleOptions} />
                </Field>
                <Field label="Rol apoyo" help={roleHelp.support}>
                  <RoleSelect defaultRole={null} name="support_role_id" roles={roleOptions} />
                </Field>
                <Field label="Rol respaldo" help={roleHelp.backup}>
                  <RoleSelect defaultRole={null} name="backup_role_id" roles={roleOptions} />
                </Field>
              </div>
            </div>

            <div className="rounded-lg border border-line bg-mist p-4">
              <h3 className="font-bold text-navy">4. Soporte operativo</h3>
              <p className="mt-1 text-sm text-slate-600">
                Sistemas, riesgo y control que apareceran en la linea de tiempo.
              </p>
              <div className="mt-4 grid gap-4">
                <Field label="Sistemas">
                  <SystemChecklist systems={systems} />
                </Field>
                <div className="grid gap-4 lg:grid-cols-2">
                  <Field label="Riesgo principal">
                    <input className={inputClass} name="risk_name" placeholder="Ej: Pago y reserva no coinciden" />
                  </Field>
                  <Field label="Control principal">
                    <input className={inputClass} name="control_name" placeholder="Ej: Validacion diaria de pagos" />
                  </Field>
                </div>
              </div>
            </div>

            <button
              className="inline-flex items-center justify-center gap-2 rounded-md bg-sea px-4 py-2 text-sm font-bold text-white transition hover:bg-[#007bb0]"
              type="submit"
            >
              <PlusCircle className="h-4 w-4" />
              Agregar etapa
            </button>
          </form>
        </details>

        {rows.map((row, index) => (
          <div
            className="rounded-lg border border-line bg-white"
            key={row.subprocess_id}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => handleDrop(index)}
          >
            <details>
              <summary className="cursor-pointer list-none px-4 py-3 transition hover:bg-[#eef4f8]">
                <div className="grid gap-2 md:grid-cols-[38px_90px_1fr_120px_120px] md:items-center">
                  <span
                    className="inline-flex h-8 w-8 cursor-grab items-center justify-center rounded-md border border-line bg-white text-slate-500 active:cursor-grabbing"
                    draggable
                    onDragStart={() => setDragIndex(index)}
                    title="Arrastrar etapa"
                  >
                    <GripVertical className="h-4 w-4" />
                  </span>
                  <span className="text-sm font-bold text-sea">Etapa {row.sort_order ?? index + 1}</span>
                  <span className="font-bold text-navy">{row.subprocess_name}</span>
                  <span className="text-sm text-slate-600">
                    {row.impact_percent === null ? "Sin impacto" : `${row.impact_percent}%`}
                  </span>
                  <TypedBadge type="criticality" value={row.criticality} />
                </div>
              </summary>

              <div className="border-t border-line p-4">
                <form action={updateSubprocessDetail}>
                  <input name="process_id" type="hidden" value={processId} />
                  <input name="subprocess_id" type="hidden" value={row.subprocess_id} />
                  <input name="sort_order" type="hidden" value={row.sort_order ?? index + 1} />
                  {rows.map((impactRow) => (
                    <input
                      key={impactRow.subprocess_id}
                      name={`impact_all:${impactRow.subprocess_id}`}
                      type="hidden"
                      value={impactRow.impact_percent ?? ""}
                    />
                  ))}

                  <div className="grid gap-4 lg:grid-cols-[1fr_160px_160px]">
                    <Field label="Nombre etapa">
                      <input className={inputClass} name="name" required defaultValue={row.subprocess_name} />
                    </Field>
                    <Field label="Impacto %">
                      <input
                        className={inputClass}
                        max={100}
                        min={0}
                        name="impact_percent"
                        type="number"
                        value={row.impact_percent ?? ""}
                        onBlur={handleImpactBlur}
                        onChange={(event) => handleImpactChange(index, event.target.value)}
                        onFocus={handleImpactFocus}
                      />
                    </Field>
                    <Field label="Criticidad">
                      <select className={inputClass} name="criticality" defaultValue={row.criticality}>
                        {criticalityOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_180px]">
                    <Field label="Descripcion">
                      <textarea className={`${inputClass} min-h-24`} name="description" defaultValue={row.subprocess_description ?? ""} />
                    </Field>
                    <Field label="Frecuencia">
                      <input className={inputClass} name="frequency" />
                    </Field>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-4">
                    <Field label="Rol dueno" help={roleHelp.owner}>
                      <RoleSelect
                        defaultPersonName={row.owner_person_name}
                        defaultRole={row.owner_role_name}
                        name="owner_role_id"
                        roles={roleOptions}
                      />
                    </Field>
                    <Field label="Rol usuario" help={roleHelp.user}>
                      <RoleSelect
                        defaultPersonName={row.user_person_name}
                        defaultRole={row.user_role_name}
                        name="user_role_id"
                        roles={roleOptions}
                      />
                    </Field>
                    <Field label="Rol apoyo" help={roleHelp.support}>
                      <RoleSelect
                        defaultPersonName={row.support_person_name}
                        defaultRole={row.support_role_name}
                        name="support_role_id"
                        roles={roleOptions}
                      />
                    </Field>
                    <Field label="Rol respaldo" help={roleHelp.backup}>
                      <RoleSelect
                        defaultPersonName={row.backup_person_name}
                        defaultRole={row.backup_role_name === "No definido" ? null : row.backup_role_name}
                        name="backup_role_id"
                        roles={roleOptions}
                      />
                    </Field>
                  </div>

                  <div className="mt-4 rounded-lg border border-line bg-mist p-4">
                    <h3 className="font-bold text-navy">Soporte operativo</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      Estos datos alimentan el bloque de sistemas, riesgo y control de la ficha.
                    </p>
                    <div className="mt-4 grid gap-4">
                      <Field label="Sistemas">
                        <SystemChecklist defaultNames={splitList(row.systems)} systems={systems} />
                      </Field>
                      <div className="grid gap-4 lg:grid-cols-2">
                        <Field label="Riesgo principal">
                          <input className={inputClass} name="risk_name" defaultValue={firstListItem(row.risks)} />
                        </Field>
                        <Field label="Control principal">
                          <input className={inputClass} name="control_name" defaultValue={firstListItem(row.controls)} />
                        </Field>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex justify-end">
                    <PrimaryButton>Guardar etapa</PrimaryButton>
                  </div>
                </form>

                <form action={deleteSubprocess} className="mt-4 border-t border-line pt-4">
                  <input name="process_id" type="hidden" value={processId} />
                  <input name="subprocess_id" type="hidden" value={row.subprocess_id} />
                  <button
                    className="inline-flex items-center gap-2 rounded-md border border-[#ffd6b0] bg-[#fff7ef] px-4 py-2 text-sm font-bold text-[#86510d] transition hover:bg-[#ffe6ca]"
                    type="submit"
                  >
                    <Archive className="h-4 w-4" />
                    Archivar etapa
                  </button>
                  <p className="mt-2 text-xs text-slate-500">
                    Esto oculta la etapa del editor y la ficha normal, conservando sus relaciones historicas.
                  </p>
                </form>
              </div>
            </details>
          </div>
        ))}
      </div>
    </section>
  );
}
