"use client";

import { Pencil, Save, X } from "lucide-react";
import { useState } from "react";

import {
  addSubprocessBasic,
  updateProcessBasics,
  updateSubprocessBasics,
  updateSubprocessOwnerRole,
} from "@/app/admin/actions";
import {
  criticalityOptions,
  documentationOptions,
  statusOptions,
} from "@/components/dashboard/badge";
import type {
  ProcessCatalogItem,
  ProcessMatrixRow,
  RoleDictionaryItem,
} from "@/lib/dashboard/data";

const inputClass =
  "w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none transition focus:border-sea focus:ring-2 focus:ring-[#e6edf3]";

const processTypeOptions = [
  { label: "Estrategico", value: "strategic" },
  { label: "Operativo / Clave", value: "operational" },
  { label: "Soporte", value: "support" },
];

function Field({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-600">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function StageBasicsForm({
  currentOwnerRoleId,
  processId,
  roleDictionary,
  stage,
  stageNumber,
}: {
  currentOwnerRoleId: string;
  processId: string;
  roleDictionary: RoleDictionaryItem[];
  stage: ProcessMatrixRow;
  stageNumber: number;
}) {
  const activeRoles = roleDictionary.filter((role) => role.role_status === "active");

  return (
    <div className="rounded-xl border border-[#dce7ef] bg-[#fbfdfe] p-4">
      <form action={updateSubprocessBasics}>
        <input name="process_id" type="hidden" value={processId} />
        <input name="subprocess_id" type="hidden" value={stage.subprocess_id} />
        <input name="return_to" type="hidden" value="/procesos" />

        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-sea">
              Etapa {stage.sort_order ?? stageNumber}
            </p>
            <p className="mt-1 text-sm font-medium text-navy">{stage.subprocess_name}</p>
          </div>
          <button
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#cbd8e3] bg-white px-3 py-2 text-sm font-medium text-navy transition hover:bg-[#f6f8fa]"
            type="submit"
          >
            <Save className="h-4 w-4 text-sea" />
            Guardar etapa
          </button>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_150px_130px]">
          <Field label="Nombre">
            <input
              className={inputClass}
              defaultValue={stage.subprocess_name}
              name="name"
              required
            />
          </Field>
          <Field label="Criticidad">
            <select className={inputClass} defaultValue={stage.criticality} name="criticality">
              {criticalityOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Impacto %">
            <input
              className={inputClass}
              defaultValue={stage.impact_percent ?? ""}
              max={100}
              min={0}
              name="impact_percent"
              type="number"
            />
          </Field>
        </div>

        <div className="mt-4">
          <Field label="Descripcion">
            <textarea
              className={`${inputClass} min-h-20`}
              defaultValue={stage.subprocess_description ?? ""}
              name="description"
            />
          </Field>
        </div>
      </form>

      <OwnerRoleForm
        currentOwnerRoleId={currentOwnerRoleId}
        processId={processId}
        roles={activeRoles}
        stage={stage}
      />
    </div>
  );
}

function roleOptionLabel(role: RoleDictionaryItem) {
  const context = [role.area_name, role.company_name].filter(Boolean).join(" - ");

  return context ? `${role.role_name} (${context})` : role.role_name;
}

function roleText(roleName: string | null, personName: string | null) {
  if (!roleName || roleName === "No definido") {
    return "No definido";
  }

  return [roleName, personName ?? "Sin persona asignada"].join(" \u00b7 ");
}

function ReadOnlyStageRoles({ stage }: { stage: ProcessMatrixRow }) {
  const roles = [
    { label: "Usuario", value: roleText(stage.user_role_name, stage.user_person_name) },
    { label: "Apoyo / consultado", value: roleText(stage.support_role_name, stage.support_person_name) },
    { label: "Respaldo", value: roleText(stage.backup_role_name, stage.backup_person_name) },
  ];

  return (
    <div className="mt-4 rounded-lg border border-[#dce7ef] bg-white px-3 py-3">
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
        Otros roles de la etapa
      </p>
      <div className="mt-2 grid gap-1.5 text-xs text-slate-600 sm:grid-cols-2">
        {roles.map((role) => (
          <p key={role.label}>
            <span className="font-medium text-slate-500">{role.label}:</span>{" "}
            <span className={role.value === "No definido" ? "text-slate-400" : "text-slate-700"}>
              {role.value}
            </span>
          </p>
        ))}
      </div>
    </div>
  );
}

function OwnerRoleForm({
  currentOwnerRoleId,
  processId,
  roles,
  stage,
}: {
  currentOwnerRoleId: string;
  processId: string;
  roles: RoleDictionaryItem[];
  stage: ProcessMatrixRow;
}) {
  const [selectedRoleId, setSelectedRoleId] = useState(currentOwnerRoleId);
  const selectedRole = roles.find((role) => role.role_id === selectedRoleId);
  const currentPerson = selectedRole?.current_person_name ?? "Sin persona asignada";

  return (
    <form action={updateSubprocessOwnerRole} className="mt-4 border-t border-[#d6e1ea] pt-4">
      <input name="process_id" type="hidden" value={processId} />
      <input name="subprocess_id" type="hidden" value={stage.subprocess_id} />
      <input name="criticality" type="hidden" value={stage.criticality} />
      <input name="impact_percent" type="hidden" value={stage.impact_percent ?? ""} />
      <input name="return_to" type="hidden" value="/procesos" />

      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <Field label="Rol dueño">
          <select
            className={inputClass}
            name="owner_role_id"
            onChange={(event) => setSelectedRoleId(event.target.value)}
            value={selectedRoleId}
          >
            <option value="">Sin rol dueño</option>
            {roles.map((role) => (
              <option key={role.role_id} value={role.role_id}>
                {roleOptionLabel(role)}
              </option>
            ))}
          </select>
        </Field>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#cbd8e3] bg-white px-3 py-2 text-sm font-medium text-navy transition hover:bg-[#f6f8fa]"
          type="submit"
        >
          <Save className="h-4 w-4 text-sea" />
          Guardar rol dueño
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Persona actual: {selectedRoleId ? currentPerson : "Sin persona asignada"}
      </p>
      <ReadOnlyStageRoles stage={stage} />
    </form>
  );
}

function AddStageForm({
  nextSortOrder,
  processId,
}: {
  nextSortOrder: number;
  processId: string;
}) {
  return (
    <form
      action={addSubprocessBasic}
      className="rounded-xl border border-dashed border-[#b9d4e4] bg-[#f7fbfd] p-4"
    >
      <input name="process_id" type="hidden" value={processId} />
      <input name="return_to" type="hidden" value="/procesos" />
      <input name="sort_order" type="hidden" value={nextSortOrder} />

      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <div>
          <h4 className="text-sm font-medium text-navy">Agregar etapa</h4>
          <p className="mt-1 text-sm leading-5 text-slate-600">
            Crea una etapa basica. Roles, sistemas, riesgos y controles se completan despues.
          </p>
        </div>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-sea px-3 py-2 text-sm font-medium text-white transition hover:bg-[#007bb0]"
          type="submit"
        >
          <Save className="h-4 w-4" />
          Agregar etapa
        </button>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_150px_130px]">
        <Field label="Nombre de la etapa">
          <input className={inputClass} name="name" required />
        </Field>
        <Field label="Criticidad">
          <select className={inputClass} defaultValue="medium" name="criticality">
            {criticalityOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
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

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_180px]">
        <Field label="Descripcion">
          <textarea className={`${inputClass} min-h-20`} name="description" />
        </Field>
        <Field label="Frecuencia">
          <input className={inputClass} name="frequency" placeholder="Ej: mensual" />
        </Field>
      </div>
    </form>
  );
}

export function ProcessEditModal({
  ownerRoleBySubprocess,
  process,
  roleDictionary,
  stages,
}: {
  ownerRoleBySubprocess: Record<string, string>;
  process: ProcessCatalogItem;
  roleDictionary: RoleDictionaryItem[];
  stages: ProcessMatrixRow[];
}) {
  const [open, setOpen] = useState(false);
  const nextSortOrder =
    stages.reduce((max, stage) => Math.max(max, Number(stage.sort_order ?? 0)), 0) + 1;

  return (
    <>
      <button
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white transition hover:bg-[#052a5a]"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
        type="button"
      >
        <Pencil className="h-4 w-4 text-clay" />
        Editar proceso
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[#032b4f]/30 px-4 py-6 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <section
            aria-labelledby={`process-edit-${process.process_id}`}
            aria-modal="true"
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-[#cbd8e3] bg-white shadow-[0_24px_70px_rgba(2,53,116,0.20)]"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header className="flex items-start justify-between gap-4 border-b border-[#d6e1ea] px-5 py-4">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-sea">
                  Procesos
                </p>
                <h2 className="mt-1 text-lg font-medium text-navy" id={`process-edit-${process.process_id}`}>
                  Editar proceso
                </h2>
                <p className="mt-1 text-sm leading-5 text-slate-600">
                  Actualiza la informacion base sin salir de Procesos.
                </p>
              </div>
              <button
                aria-label="Cerrar"
                className="rounded-lg border border-[#cbd8e3] bg-white p-2 text-slate-500 transition hover:bg-[#f6f8fa] hover:text-navy"
                onClick={() => setOpen(false)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <form action={updateProcessBasics} className="grid gap-4 p-5">
              <input name="process_id" type="hidden" value={process.process_id} />
              <input name="return_to" type="hidden" value="/procesos" />

              <Field label="Nombre del proceso">
                <input
                  className={inputClass}
                  defaultValue={process.process_name}
                  name="name"
                  required
                />
              </Field>

              <Field label="Descripcion corta">
                <textarea
                  className={`${inputClass} min-h-24`}
                  defaultValue={process.definition ?? ""}
                  name="description"
                />
              </Field>

              <div className="grid gap-4 lg:grid-cols-2">
                <Field label="Objetivo">
                  <textarea
                    className={`${inputClass} min-h-28`}
                    defaultValue={process.objective ?? ""}
                    name="objective"
                  />
                </Field>
                <Field label="Resultado esperado">
                  <textarea
                    className={`${inputClass} min-h-28`}
                    defaultValue={process.expected_result ?? ""}
                    name="expected_result"
                  />
                </Field>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Field label="Tipo de proceso">
                  <select className={inputClass} defaultValue={process.process_type} name="process_type">
                    {processTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Criticidad">
                  <select className={inputClass} defaultValue={process.criticality} name="criticality">
                    {criticalityOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Estado">
                  <select className={inputClass} defaultValue={process.status} name="status">
                    {statusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Documentacion">
                  <select
                    className={inputClass}
                    defaultValue={process.documentation_status}
                    name="documentation_status"
                  >
                    {documentationOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="flex flex-wrap justify-end gap-2 border-t border-[#d6e1ea] pt-4">
                <button
                  className="rounded-lg border border-[#cbd8e3] bg-white px-4 py-2 text-sm font-medium text-navy transition hover:bg-[#f6f8fa]"
                  onClick={() => setOpen(false)}
                  type="button"
                >
                  Cancelar
                </button>
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white transition hover:bg-[#052a5a]"
                  type="submit"
                >
                  <Save className="h-4 w-4 text-clay" />
                  Guardar proceso
                </button>
              </div>
            </form>

            <section className="border-t border-[#d6e1ea] p-5">
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                <div>
                  <h3 className="text-base font-medium text-navy">Etapas / subprocesos</h3>
                  <p className="mt-1 text-sm leading-5 text-slate-600">
                    Edita la informacion base de cada etapa. Roles, sistemas y riesgos se mantienen en el editor avanzado.
                  </p>
                </div>
                <span className="text-xs font-medium text-slate-500">{stages.length} etapas</span>
              </div>

              {stages.length > 0 ? (
                <div className="mt-4 grid gap-3">
                  {stages.map((stage, index) => (
                    <StageBasicsForm
                      currentOwnerRoleId={ownerRoleBySubprocess[stage.subprocess_id] ?? ""}
                      key={stage.subprocess_id}
                      processId={process.process_id}
                      roleDictionary={roleDictionary}
                      stage={stage}
                      stageNumber={index + 1}
                    />
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-lg border border-dashed border-[#d6e1ea] bg-[#fbfdfe] px-3 py-3 text-sm text-slate-600">
                  Este proceso aun no tiene etapas registradas.
                </div>
              )}

              <div className="mt-4">
                <AddStageForm nextSortOrder={nextSortOrder} processId={process.process_id} />
              </div>
            </section>
          </section>
        </div>
      ) : null}
    </>
  );
}
