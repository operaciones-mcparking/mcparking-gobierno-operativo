"use client";

import { PlusCircle, X } from "lucide-react";
import { useState } from "react";

import { assignAccessRole } from "./actions";

type IdName = {
  id: string;
  name: string;
};

type AccessRoleItem = {
  id: string;
  name: string;
};

const inputClass =
  "h-10 w-full rounded-lg border border-[#ccd9e5] bg-white px-3 text-sm outline-none transition focus:border-sea focus:ring-2 focus:ring-[#dceff5]";

function Field({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={inputClass} />;
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={inputClass} />;
}

function StatusSelect() {
  return (
    <Select defaultValue="active" name="status">
      <option value="active">Activo</option>
      <option value="archived">Archivado</option>
    </Select>
  );
}

export function AssignAccessModal({
  accessRoles,
  companies,
  countries,
  people,
  sites,
}: {
  accessRoles: AccessRoleItem[];
  companies: IdName[];
  countries: IdName[];
  people: IdName[];
  sites: IdName[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-navy px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-[#034982]"
          onClick={() => setOpen(true)}
          type="button"
        >
          <PlusCircle className="h-4 w-4" />
          Asignar acceso
        </button>
      </div>

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
            className="relative z-10 max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-[0_24px_80px_rgba(2,53,116,0.28)]"
            role="dialog"
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[#d6e1ea] bg-white px-5 py-4">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-sea">
                  RBAC
                </p>
                <h3 className="mt-1 text-xl font-medium text-navy">Asignar rol de acceso</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Elige una persona, un rol de acceso y el alcance donde aplica.
                </p>
              </div>
              <button
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#d6e1ea] text-slate-600 transition hover:bg-[#f8fafb]"
                onClick={() => setOpen(false)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form action={assignAccessRole} className="grid gap-4 bg-[#f8fbfd] p-5">
              <div className="grid gap-3 lg:grid-cols-4">
                <Field label="Persona">
                  <Select name="person_id" required>
                    <option value="">Selecciona persona</option>
                    {people.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Rol de acceso">
                  <Select name="access_role_id" required>
                    <option value="">Selecciona rol</option>
                    {accessRoles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Alcance">
                  <Select name="scope_type" required>
                    <option value="global">Global</option>
                    <option value="country">Pais</option>
                    <option value="company">Empresa</option>
                    <option value="site">Sede</option>
                  </Select>
                </Field>
                <Field label="Estado">
                  <StatusSelect />
                </Field>
              </div>
              <div className="grid gap-3 lg:grid-cols-4">
                <Field label="Pais">
                  <Select name="country_id">
                    <option value="">Sin pais</option>
                    {countries.map((country) => (
                      <option key={country.id} value={country.id}>
                        {country.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Empresa">
                  <Select name="company_id">
                    <option value="">Sin empresa</option>
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Sede">
                  <Select name="site_id">
                    <option value="">Sin sede</option>
                    {sites.map((site) => (
                      <option key={site.id} value={site.id}>
                        {site.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Inicio">
                  <Input name="start_date" type="date" />
                </Field>
              </div>
              <div className="flex flex-col gap-3 rounded-xl border border-[#d6e1ea] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-600">
                  Si eliges sede, el pais y la empresa se completan desde esa sede.
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    className="rounded-lg border border-[#cbd8e3] bg-white px-4 py-2.5 text-sm font-medium text-navy transition hover:bg-[#f8fafb]"
                    onClick={() => setOpen(false)}
                    type="button"
                  >
                    Cancelar
                  </button>
                  <button
                    className="rounded-lg bg-navy px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-[#034982]"
                    type="submit"
                  >
                    Asignar acceso
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
