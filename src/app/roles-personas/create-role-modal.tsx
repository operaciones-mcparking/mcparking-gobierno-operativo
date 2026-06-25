"use client";

import { PlusCircle, X } from "lucide-react";
import { useState } from "react";
import { useFormStatus } from "react-dom";

import { createRoleDictionaryEntry } from "@/app/admin/actions";
import { roleLevelOptions } from "@/components/dashboard/badge";

type AreaOption = {
  company_name?: string | null;
  id: string;
  name: string;
};

type PersonOption = {
  id: string;
  name: string;
};

type RoleOption = {
  role_code?: string | null;
  role_id: string;
  role_name: string;
};

const inputClass =
  "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none transition focus:border-sea focus:ring-2 focus:ring-[#e6edf3]";

function areaLabel(area: AreaOption) {
  if (!area.company_name || area.company_name.toLowerCase() === "mcparking") {
    return area.name;
  }

  return `${area.name} / ${area.company_name}`;
}

function Field({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-slate-700">
      {label}
      {children}
    </label>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="inline-flex items-center justify-center gap-2 rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white transition hover:bg-[#01295b] disabled:cursor-wait disabled:opacity-70"
      disabled={pending}
      type="submit"
    >
      <PlusCircle className="h-4 w-4" />
      {pending ? "Creando..." : "Crear rol"}
    </button>
  );
}

function LocationFields({ roles }: { roles: RoleOption[] }) {
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <h4 className="text-sm font-medium text-navy">Ubicacion en organigrama</h4>
      <p className="mt-1 text-xs text-slate-500">
        Define de quien depende. La posicion visual se acomoda automaticamente.
      </p>
      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr] lg:items-end">
        <Field label="Depende de">
          <select className={inputClass} name="org_parent_role_id" defaultValue="">
            <option value="">Nivel superior</option>
            {roles.map((role) => (
              <option key={role.role_id} value={role.role_id}>
                {role.role_name}
                {role.role_code ? ` (${role.role_code})` : ""}
              </option>
            ))}
          </select>
        </Field>
        <div className="rounded-lg border border-line bg-[#f8fafb] px-3 py-2 text-sm leading-6 text-slate-600">
          El organigrama ordena automaticamente segun jerarquia, orden del cargo y
          espacio disponible.
        </div>
      </div>
    </div>
  );
}

export function CreateRoleModal({
  areas,
  people,
  returnTo,
  roles,
}: {
  areas: AreaOption[];
  people: PersonOption[];
  returnTo: string;
  roles: RoleOption[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white transition hover:bg-[#01295b]"
        onClick={() => setOpen(true)}
        type="button"
      >
        <PlusCircle className="h-4 w-4" />
        Nuevo rol
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
          <button
            aria-label="Cerrar formulario"
            className="absolute inset-0 bg-navy/45 backdrop-blur-[1px]"
            onClick={() => setOpen(false)}
            type="button"
          />
          <div
            aria-modal="true"
            className="relative z-10 max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white shadow-[0_24px_80px_rgba(2,53,116,0.28)]"
            role="dialog"
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-white px-5 py-4">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-sea">
                  Nuevo cargo
                </p>
                <h3 className="mt-1 text-xl font-medium text-navy">Crear nuevo rol</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Agrega el cargo al diccionario y define su ubicacion en el organigrama.
                </p>
              </div>
              <button
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line text-slate-600 transition hover:bg-[#f8fafb]"
                onClick={() => setOpen(false)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form action={createRoleDictionaryEntry} className="grid gap-4 bg-[#f8fafb] p-5">
              <input name="return_to" type="hidden" value={returnTo} />

              <div className="rounded-xl border border-line bg-white p-4">
                <h4 className="mb-4 text-sm font-medium text-navy">Datos del cargo</h4>
                <div className="grid gap-3">
                  <Field label="Nombre del rol">
                    <input
                      className={inputClass}
                      name="name"
                      placeholder="Ej: Coordinador de operaciones"
                      required
                    />
                  </Field>
                </div>
                <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_220px]">
                  <Field label="Area">
                    <select className={inputClass} name="area_id" required>
                      <option value="">Selecciona area</option>
                      {areas.map((area) => (
                        <option key={area.id} value={area.id}>
                          {areaLabel(area)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Nivel">
                    <select className={inputClass} name="level" defaultValue="operational">
                      {roleLevelOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-500">
                  El codigo interno se genera automaticamente desde el nombre del rol.
                </p>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
                <div className="rounded-xl border border-line bg-white p-4">
                  <h4 className="mb-4 text-sm font-medium text-navy">Proposito del rol</h4>
                  <Field label="Objetivo / descripcion">
                    <textarea className={`${inputClass} min-h-24`} name="description" />
                  </Field>
                </div>
                <div className="rounded-xl border border-line bg-white p-4">
                  <h4 className="mb-4 text-sm font-medium text-navy">Asignacion actual</h4>
                  <Field label="Persona actual">
                    <select className={inputClass} name="person_id" defaultValue="">
                      <option value="">Sin persona asignada</option>
                      {people.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <p className="mt-3 text-xs leading-5 text-slate-500">
                    La persona solo representa quien ocupa hoy el rol. La estructura sigue
                    siendo el rol.
                  </p>
                </div>
              </div>

              <LocationFields roles={roles} />

              <div className="rounded-xl border border-line bg-white p-4">
                <Field label="Responsabilidades principales">
                  <textarea
                    className={`${inputClass} min-h-24`}
                    name="responsibilities"
                    placeholder="Una responsabilidad por linea"
                  />
                </Field>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-5 text-sm text-slate-700">
                    <label className="inline-flex items-center gap-2">
                      <input
                        className="h-4 w-4 rounded border-line text-sea"
                        defaultChecked
                        name="is_corporate"
                        type="checkbox"
                      />
                      Corporativo
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input
                        className="h-4 w-4 rounded border-line text-sea"
                        name="is_local"
                        type="checkbox"
                      />
                      Local
                    </label>
                  </div>
                  <SubmitButton />
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
