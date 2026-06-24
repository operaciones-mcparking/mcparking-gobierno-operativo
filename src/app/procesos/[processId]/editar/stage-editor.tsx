"use client";

import { useRef, useState, useTransition } from "react";
import { GripVertical, HelpCircle, PlusCircle, Save, Trash2 } from "lucide-react";

import { reorderSubprocesses } from "@/app/admin/actions";
import {
  addSubprocessToProcess,
  deleteSubprocess,
  updateSubprocessImpacts,
  updateSubprocessDetail,
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
  user_role_name: string | null;
  support_role_name: string | null;
  impact_percent: number | null;
  backup_role_name: string | null;
  systems: string | null;
  risks: string | null;
  controls: string | null;
};

type Role = {
  id: string;
  name: string;
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
  backup: "Rol que puede cubrir la etapa si el rol dueño o la persona asignada no está disponible.",
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
  defaultRole,
  name,
  roles,
}: {
  defaultRole: string | null;
  name: string;
  roles: Role[];
}) {
  const defaultRoleId = roles.find((role) => role.name === defaultRole)?.id ?? "";

  return (
    <select className={inputClass} defaultValue={defaultRoleId} name={name}>
      <option value="">No definido</option>
      {roles.map((role) => (
        <option key={role.id} value={role.id}>
          {role.name}
        </option>
      ))}
    </select>
  );
}

function roleTone(level: string | null) {
  if (level === "executive" || level === "board") return "info";
  if (level === "strategic" || level === "tactical") return "warning";
  return "success";
}

function normalizeRoleName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function hasMatchingSystemRole(dictionaryRole: RoleDictionaryItem, roles: Role[]) {
  const title = normalizeRoleName(dictionaryRole.role_name);
  const area = normalizeRoleName(dictionaryRole.area_name ?? "");

  return roles.some((role) => {
    const roleName = normalizeRoleName(role.name);
    return roleName.includes(title) || title.includes(roleName) || roleName.includes(area);
  });
}

function roleLevelLabel(level: string | null) {
  if (level === "executive") return "Ejecutivo";
  if (level === "strategic") return "Estrategico";
  if (level === "tactical") return "Tactico";
  if (level === "board") return "Directorio";
  return "Operativo";
}

function RoleDictionary({
  dictionary,
  roles,
}: {
  dictionary: RoleDictionaryItem[];
  roles: Role[];
}) {
  return (
    <section className="rounded-xl border border-line bg-white">
      <div className="flex flex-col justify-between gap-2 border-b border-line px-4 py-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-sm font-medium text-navy">Diccionario de roles operativo</h3>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            Usalo como guia para elegir rol dueno, usuario, apoyo o respaldo al construir etapas.
          </p>
        </div>
        <span className="text-xs text-slate-500">{dictionary.length} roles base</span>
      </div>

      {dictionary.length === 0 ? (
        <div className="p-4 text-sm text-slate-600">
          Todavia no hay diccionario cargado. Crealo o editalo desde Roles y personas.
        </div>
      ) : (
        <div className="grid gap-2 p-3 md:grid-cols-2 xl:grid-cols-4">
        {dictionary.map((role) => {
          const available = hasMatchingSystemRole(role, roles);

          return (
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
                  <ValueBadge tone={available ? "success" : "neutral"}>
                    {role.role_code ?? "Sin codigo"}
                  </ValueBadge>
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
                <p className="mt-3 text-[11px] leading-5 text-slate-500">
                  {available
                    ? "Existe una referencia similar entre los roles cargados."
                    : "Si este rol no aparece en los selectores, revisa su creacion en Roles y personas."}
                </p>
              </div>
            </details>
          );
        })}
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

function clampImpact(value: number) {
  if (Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeImpacts(items: StageRow[]) {
  const currentTotal = items.reduce((total, item) => total + (item.impact_percent ?? 0), 0);

  if (items.length === 0) {
    return items;
  }

  if (currentTotal === 100) {
    return items;
  }

  if (currentTotal === 0) {
    const base = Math.floor(100 / items.length);
    let remainder = 100 - base * items.length;

    return items.map((item) => {
      const extra = remainder > 0 ? 1 : 0;
      remainder -= extra;
      return { ...item, impact_percent: base + extra };
    });
  }

  return distributeRemaining(items, 100, currentTotal);
}

function distributeRemaining(items: StageRow[], targetTotal: number, currentTotal: number) {
  const raw = items.map((item) => {
    const currentImpact = item.impact_percent ?? 0;
    const exact = (currentImpact / currentTotal) * targetTotal;
    const floor = Math.floor(exact);

    return {
      exact,
      floor,
      item,
      remainder: exact - floor,
    };
  });
  let remaining = targetTotal - raw.reduce((total, item) => total + item.floor, 0);
  const sorted = [...raw].sort((a, b) => b.remainder - a.remainder);
  const extras = new Map<StageRow, number>();

  for (const entry of sorted) {
    if (remaining <= 0) {
      break;
    }

    extras.set(entry.item, (extras.get(entry.item) ?? 0) + 1);
    remaining -= 1;
  }

  return raw.map((entry) => ({
    ...entry.item,
    impact_percent: entry.floor + (extras.get(entry.item) ?? 0),
  }));
}

function rebalanceImpacts(items: StageRow[], changedIndex: number, nextImpact: number) {
  if (items.length <= 1) {
    return items.map((item, index) => ({
      ...item,
      impact_percent: index === changedIndex ? 100 : item.impact_percent,
    }));
  }

  const changedImpact = clampImpact(nextImpact);
  const remaining = 100 - changedImpact;
  const otherItems = items.filter((_, index) => index !== changedIndex);
  const otherTotal = otherItems.reduce((total, item) => total + (item.impact_percent ?? 0), 0);
  const balancedOthers =
    otherTotal > 0
      ? distributeRemaining(otherItems, remaining, otherTotal)
      : distributeRemaining(normalizeImpacts(otherItems), remaining, 100);
  let otherIndex = 0;

  return items.map((item, index) => {
    if (index === changedIndex) {
      return { ...item, impact_percent: changedImpact };
    }

    const balanced = balancedOthers[otherIndex];
    otherIndex += 1;

    return {
      ...item,
      impact_percent: balanced.impact_percent ?? 0,
    };
  });
}

export function StageEditor({
  initialRows,
  nextSortOrder,
  processId,
  roles,
  roleDictionary,
  systems,
}: {
  initialRows: StageRow[];
  nextSortOrder: number;
  processId: string;
  roles: Role[];
  roleDictionary: RoleDictionaryItem[];
  systems: System[];
}) {
  const [rows, setRows] = useState(normalizeImpacts(initialRows));
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const impactBaselineRef = useRef<StageRow[] | null>(null);

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
          impactPercent: row.impact_percent ?? 0,
        })),
      );
      setMessage(result.error ? result.error : "Impactos actualizados");
    });
  }

  function handleImpactChange(index: number, value: string) {
    const baseline = impactBaselineRef.current ?? rows;
    const nextRows = rebalanceImpacts(baseline, index, Number(value));
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
            <h2 className="text-xl font-bold text-navy">Etapas existentes</h2>
            <p className="mt-1 text-sm text-slate-600">
              Arrastra etapas para cambiar su posicion. El nuevo orden se guarda automaticamente.
            </p>
          </div>
          <span className="text-sm font-semibold text-sea">
            {isPending ? "Guardando..." : message}
          </span>
        </div>
      </div>

      <div className="space-y-3 px-5 py-5">
        <RoleDictionary dictionary={roleDictionary} roles={roles} />

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
                La suma de todas las etapas debe ser 100%.
              </p>
              <Field label="Impacto %">
                <input
                  className={inputClass}
                  max={100}
                  min={0}
                  name="impact_percent"
                  type="number"
                />
              </Field>
            </div>

            <div className="rounded-lg border border-line bg-mist p-4">
              <h3 className="font-bold text-navy">3. Roles asociados</h3>
              <div className="mt-4 grid gap-4 lg:grid-cols-4">
                <Field label="Rol dueño" help={roleHelp.owner}>
                  <RoleSelect defaultRole={null} name="owner_role_id" roles={roles} />
                </Field>
                <Field label="Rol usuario" help={roleHelp.user}>
                  <RoleSelect defaultRole={null} name="user_role_id" roles={roles} />
                </Field>
                <Field label="Rol apoyo" help={roleHelp.support}>
                  <RoleSelect defaultRole={null} name="support_role_id" roles={roles} />
                </Field>
                <Field label="Rol respaldo" help={roleHelp.backup}>
                  <RoleSelect defaultRole={null} name="backup_role_id" roles={roles} />
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
                    <input
                      className={inputClass}
                      name="risk_name"
                      placeholder="Ej: Pago y reserva no coinciden"
                    />
                  </Field>
                  <Field label="Control principal">
                    <input
                      className={inputClass}
                      name="control_name"
                      placeholder="Ej: Validacion diaria de pagos"
                    />
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
                  <span className="text-sm font-bold text-sea">
                    Etapa {row.sort_order ?? index + 1}
                  </span>
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
                      value={impactRow.impact_percent ?? 0}
                    />
                  ))}

                  <div className="grid gap-4 lg:grid-cols-[1fr_160px_160px]">
                    <Field label="Nombre etapa">
                      <input
                        className={inputClass}
                        name="name"
                        required
                        defaultValue={row.subprocess_name}
                      />
                    </Field>
                    <Field label="Impacto %">
                      <input
                        className={inputClass}
                        max={100}
                        min={0}
                        name="impact_percent"
                        type="number"
                        value={row.impact_percent ?? 0}
                        onBlur={handleImpactBlur}
                        onChange={(event) => handleImpactChange(index, event.target.value)}
                        onFocus={handleImpactFocus}
                      />
                    </Field>
                    <Field label="Criticidad">
                      <select
                        className={inputClass}
                        name="criticality"
                        defaultValue={row.criticality}
                      >
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
                      <textarea
                        className={`${inputClass} min-h-24`}
                        name="description"
                        defaultValue={row.subprocess_description ?? ""}
                      />
                    </Field>
                    <Field label="Frecuencia">
                      <input className={inputClass} name="frequency" />
                    </Field>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-4">
                    <Field label="Rol dueño" help={roleHelp.owner}>
                      <RoleSelect
                        defaultRole={row.owner_role_name}
                        name="owner_role_id"
                        roles={roles}
                      />
                    </Field>
                    <Field label="Rol usuario" help={roleHelp.user}>
                      <RoleSelect
                        defaultRole={row.user_role_name}
                        name="user_role_id"
                        roles={roles}
                      />
                    </Field>
                    <Field label="Rol apoyo" help={roleHelp.support}>
                      <RoleSelect
                        defaultRole={row.support_role_name}
                        name="support_role_id"
                        roles={roles}
                      />
                    </Field>
                    <Field label="Rol respaldo" help={roleHelp.backup}>
                      <RoleSelect
                        defaultRole={
                          row.backup_role_name === "No definido" ? null : row.backup_role_name
                        }
                        name="backup_role_id"
                        roles={roles}
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
                          <input
                            className={inputClass}
                            name="risk_name"
                            defaultValue={firstListItem(row.risks)}
                          />
                        </Field>
                        <Field label="Control principal">
                          <input
                            className={inputClass}
                            name="control_name"
                            defaultValue={firstListItem(row.controls)}
                          />
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
                    <Trash2 className="h-4 w-4" />
                    Eliminar etapa
                  </button>
                  <p className="mt-2 text-xs text-slate-500">
                    Esto elimina tambien las relaciones de roles y sistemas vinculadas a esta etapa.
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
