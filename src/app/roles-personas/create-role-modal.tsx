"use client";

import { PlusCircle, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createRoleDictionaryEntryInline } from "@/app/admin/actions";
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

function HelpTooltip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-line bg-[#f8fafb] text-[10px] font-medium text-slate-500">
        ?
      </span>
      <span className="pointer-events-none absolute bottom-6 left-1/2 z-20 w-64 -translate-x-1/2 rounded-lg border border-line bg-white px-3 py-2 text-xs font-normal leading-5 text-slate-600 opacity-0 shadow-[0_16px_32px_rgba(2,53,116,0.14)] transition group-hover:opacity-100">
        {text}
      </span>
    </span>
  );
}

function RolePreviewCard({
  areaName,
  parentName,
  personName,
  roleName,
}: {
  areaName: string;
  parentName: string;
  personName: string;
  roleName: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-medium text-navy">Vista previa</h4>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Asi se vera la tarjeta del cargo en el organigrama.
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-line bg-[#f8fafb] p-4">
        <div className="mx-auto max-w-[260px] rounded-xl border border-[#8db8c7] bg-white px-4 py-4 text-center shadow-[0_12px_24px_rgba(2,53,116,0.06)]">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">
            {areaName}
          </p>
          <p className="mt-2 text-base font-medium leading-6 text-navy">{roleName}</p>
          <p className="mt-2 text-sm font-medium text-[#1d6b7a]">{personName}</p>
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-line bg-[#f8fafb] px-3 py-2 text-xs leading-5 text-slate-600">
        Dependera de: <span className="font-medium text-navy">{parentName}</span>
      </div>
    </div>
  );
}

export function CreateRoleModal({
  areas,
  canCreate = true,
  people,
  returnTo,
  roles,
}: {
  areas: AreaOption[];
  canCreate?: boolean;
  people: PersonOption[];
  returnTo: string;
  roles: RoleOption[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [areaId, setAreaId] = useState("");
  const [parentRoleId, setParentRoleId] = useState("");
  const [personId, setPersonId] = useState("");
  const [roleName, setRoleName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedArea = areas.find((area) => area.id === areaId);
  const selectedParent = roles.find((role) => role.role_id === parentRoleId);
  const selectedPerson = people.find((person) => person.id === personId);
  const previewAreaName = (selectedArea?.name || "Area").toUpperCase();
  const previewParentName = selectedParent
    ? `${selectedParent.role_name}${
        selectedParent.role_code ? ` (${selectedParent.role_code})` : ""
      }`
    : "Nivel superior";
  const previewPersonName = selectedPerson?.name || "Sin persona asignada";
  const previewRoleName = roleName.trim() || "Nombre del rol";

  useEffect(() => {
    if (!notice) return;

    const timeout = window.setTimeout(() => setNotice(null), 3200);

    return () => window.clearTimeout(timeout);
  }, [notice]);

  function resetFormState() {
    formRef.current?.reset();
    setAreaId("");
    setParentRoleId("");
    setPersonId("");
    setRoleName("");
  }

  function closeModal() {
    if (isPending) return;
    setError(null);
    setOpen(false);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    setError(null);
    setNotice(null);

    startTransition(async () => {
      const result = await createRoleDictionaryEntryInline(formData);

      if (!result.ok) {
        setError(result.error || "No se pudo crear el rol.");
        return;
      }

      resetFormState();
      setOpen(false);
      setNotice("Rol creado");
      router.refresh();
    });
  }

  if (!canCreate) {
    return null;
  }

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

      {notice ? (
        <span className="fixed right-5 top-5 z-[60] inline-flex items-center rounded-lg border border-[#c9ead7] bg-[#f0fbf4] px-3 py-2 text-sm font-medium text-[#167344] shadow-[0_16px_32px_rgba(2,53,116,0.14)]">
          {notice}
        </span>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
          <button
            aria-label="Cerrar formulario"
            className="absolute inset-0 bg-navy/45 backdrop-blur-[1px]"
            onClick={closeModal}
            type="button"
          />
          <div
            aria-modal="true"
            className="relative z-10 max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-2xl bg-white shadow-[0_24px_80px_rgba(2,53,116,0.28)]"
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
                disabled={isPending}
                onClick={closeModal}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form className="grid gap-4 bg-[#f8fafb] p-5" onSubmit={handleSubmit} ref={formRef}>
              <input name="return_to" type="hidden" value={returnTo} />

              <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
                <div className="grid gap-4">
                  <div className="rounded-xl border border-line bg-white p-4">
                    <h4 className="mb-4 text-sm font-medium text-navy">1. Area y rol</h4>
                    <div className="grid gap-3">
                      <Field label="Area">
                        <select
                          className={inputClass}
                          name="area_id"
                          onChange={(event) => setAreaId(event.target.value)}
                          required
                          value={areaId}
                        >
                          <option value="">Selecciona area</option>
                          {areas.map((area) => (
                            <option key={area.id} value={area.id}>
                              {areaLabel(area)}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Nombre del rol">
                        <input
                          className={inputClass}
                          name="name"
                          onChange={(event) => setRoleName(event.target.value)}
                          placeholder="Ej: Coordinador de operaciones"
                          required
                          value={roleName}
                        />
                      </Field>
                    </div>
                    <p className="mt-3 text-xs leading-5 text-slate-500">
                      El codigo interno se genera automaticamente desde el nombre del rol.
                    </p>
                  </div>

                  <div className="rounded-xl border border-line bg-white p-4">
                    <h4 className="mb-4 text-sm font-medium text-navy">
                      2. Asignacion y dependencia
                    </h4>
                    <div className="grid gap-3 lg:grid-cols-2">
                      <Field label="Persona actual">
                        <select
                          className={inputClass}
                          name="person_id"
                          onChange={(event) => setPersonId(event.target.value)}
                          value={personId}
                        >
                          <option value="">Sin persona asignada</option>
                          {people.map((person) => (
                            <option key={person.id} value={person.id}>
                              {person.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Depende de">
                        <select
                          className={inputClass}
                          name="org_parent_role_id"
                          onChange={(event) => setParentRoleId(event.target.value)}
                          value={parentRoleId}
                        >
                          <option value="">Nivel superior</option>
                          {roles.map((role) => (
                            <option key={role.role_id} value={role.role_id}>
                              {role.role_name}
                              {role.role_code ? ` (${role.role_code})` : ""}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                    <p className="mt-3 text-xs leading-5 text-slate-500">
                      La persona muestra quien ocupa hoy el rol. La dependencia define
                      donde aparece dentro del organigrama.
                    </p>
                  </div>
                </div>

                <RolePreviewCard
                  areaName={previewAreaName}
                  parentName={previewParentName}
                  personName={previewPersonName}
                  roleName={previewRoleName}
                />
              </div>

              <div className="rounded-xl border border-line bg-white p-4">
                <h4 className="mb-4 text-sm font-medium text-navy">3. Nivel y alcance</h4>
                <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
                  <Field label="Nivel">
                    <select className={inputClass} name="level" defaultValue="operational">
                      {roleLevelOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <div>
                    <p className="text-sm font-medium text-slate-700">Alcance</p>
                    <div className="mt-2 flex flex-wrap gap-5 text-sm text-slate-700">
                      <label className="inline-flex items-center gap-2">
                        <input
                          className="h-4 w-4 rounded border-line text-sea"
                          defaultChecked
                          name="is_corporate"
                          type="checkbox"
                        />
                        Corporativo
                        <HelpTooltip text="Rol transversal de McParking. Puede aplicar a mas de una sede o area, por ejemplo Gerencia, Finanzas o Tecnologia." />
                      </label>
                      <label className="inline-flex items-center gap-2">
                        <input
                          className="h-4 w-4 rounded border-line text-sea"
                          name="is_local"
                          type="checkbox"
                        />
                        Local
                        <HelpTooltip text="Rol propio de una sede u operacion especifica, por ejemplo un cajero, supervisor o encargado local." />
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-line bg-white p-4">
                <h4 className="mb-4 text-sm font-medium text-navy">
                  4. Objetivo y responsabilidades del rol
                </h4>
                <div className="grid gap-4">
                  <Field label="Objetivo / descripcion del rol">
                    <textarea className={`${inputClass} min-h-24`} name="description" />
                  </Field>
                  <Field label="Responsabilidades principales">
                    <textarea
                      className={`${inputClass} min-h-24`}
                      name="responsibilities"
                      placeholder="Una responsabilidad por linea"
                    />
                  </Field>
                </div>
              </div>

              {error ? (
                <p className="rounded-lg border border-[#ffd6b0] bg-[#fff7ed] px-3 py-2 text-sm text-[#9a4a16]">
                  {error}
                </p>
              ) : null}

              <div className="flex justify-end rounded-xl border border-line bg-white p-4">
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white transition hover:bg-[#01295b] disabled:cursor-wait disabled:opacity-70"
                  disabled={isPending}
                  type="submit"
                >
                  <PlusCircle className="h-4 w-4" />
                  {isPending ? "Creando..." : "Crear rol"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
