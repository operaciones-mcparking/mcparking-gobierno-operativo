"use client";

import { Archive, PencilLine, X } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { archiveRoleInline, updateRoleDictionaryEntryInline } from "@/app/admin/actions";
import { roleLevelOptions } from "@/components/dashboard/badge";
import type { PersonDirectoryItem } from "@/lib/dashboard/data";
import type { OrgRole } from "@/lib/dashboard/organization";

const inputClass =
  "w-full rounded-lg border border-[#cbd8e3] bg-white px-3 py-2 text-sm outline-none transition focus:border-sea focus:ring-2 focus:ring-[#e6edf3]";

function levelValue(level: OrgRole["level"]) {
  if (level === "Direccion") return "directivo";
  if (level === "Gestion") return "gerencial";
  return "operational";
}

function Field({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-slate-700">
      {label}
      {children}
    </label>
  );
}

function currentPersonValue(role: OrgRole, people: PersonDirectoryItem[]) {
  if (role.person === "Sin persona asignada") return "";

  return people.find((person) => person.name === role.person)?.id ?? "";
}

export function RoleEditModal({
  canEdit = false,
  people = [],
  role,
  roles = [],
  trigger = "button",
}: {
  canEdit?: boolean;
  people?: PersonDirectoryItem[];
  role: OrgRole;
  roles?: OrgRole[];
  trigger?: "button" | "icon";
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isArchivePending, startArchiveTransition] = useTransition();

  useEffect(() => {
    if (!notice) return;

    const timeout = window.setTimeout(() => setNotice(null), 3200);

    return () => window.clearTimeout(timeout);
  }, [notice]);

  function closeModal() {
    if (isPending || isArchivePending) return;
    setError(null);
    setArchiveError(null);
    setConfirmArchiveOpen(false);
    setOpen(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    setError(null);
    setNotice(null);

    startTransition(async () => {
      const result = await updateRoleDictionaryEntryInline(formData);

      if (!result.ok) {
        setError(result.error || "No se pudo actualizar el cargo.");
        return;
      }

      setOpen(false);
      setNotice("Cargo actualizado");
      router.refresh();
    });
  }

  function handleArchive() {
    if (!role.id) return;

    const formData = new FormData();
    formData.set("role_id", role.id);

    setArchiveError(null);
    setNotice(null);

    startArchiveTransition(async () => {
      const result = await archiveRoleInline(formData);

      if (!result.ok) {
        setArchiveError(result.error || "No se pudo archivar el cargo.");
        return;
      }

      setOpen(false);
      setConfirmArchiveOpen(false);
      setNotice("Cargo archivado");
      router.refresh();
    });
  }

  if (!canEdit || !role.id) {
    return null;
  }

  return (
    <>
      {trigger === "icon" ? (
        <button
          aria-label={`Editar cargo ${role.title}`}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#cbd8e3] bg-white text-slate-500 transition hover:border-sea hover:bg-[#eef4f8] hover:text-navy"
          onClick={(event) => {
            event.preventDefault();
            setOpen(true);
          }}
          title="Editar cargo"
          type="button"
        >
          <PencilLine className="h-4 w-4 text-sea" />
        </button>
      ) : (
        <button
          className="inline-flex items-center gap-2 rounded-lg border border-[#cbd8e3] bg-white px-3 py-2 text-sm font-medium text-navy transition hover:border-sea hover:bg-[#eef4f8]"
          onClick={() => setOpen(true)}
          type="button"
        >
          <PencilLine className="h-4 w-4 text-sea" />
          Editar cargo
        </button>
      )}

      {notice ? (
        <span className="fixed right-5 top-5 z-[70] inline-flex items-center rounded-lg border border-[#c9ead7] bg-[#f0fbf4] px-3 py-2 text-sm font-medium text-[#167344] shadow-[0_16px_32px_rgba(2,53,116,0.14)]">
          {notice}
        </span>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-[#032b4f]/45 px-4 py-6 backdrop-blur-sm">
          <button
            aria-label="Cerrar editor"
            className="absolute inset-0"
            onClick={closeModal}
            type="button"
          />

          <section
            aria-labelledby={`role-edit-${role.id}`}
            aria-modal="true"
            className="relative w-full max-w-3xl overflow-hidden rounded-2xl border border-[#cbd8e3] bg-white shadow-[0_24px_70px_rgba(2,53,116,0.20)]"
            role="dialog"
          >
            <header className="flex items-start justify-between gap-4 border-b border-[#d6e1ea] px-5 py-4">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-sea">
                  Editar cargo
                </p>
                <h2 className="mt-1 text-lg font-medium text-navy" id={`role-edit-${role.id}`}>
                  {role.title}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Actualiza la informacion del cargo sin salir de Estructura.
                </p>
              </div>
              <button
                aria-label="Cerrar"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#cbd8e3] bg-white text-slate-500 transition hover:border-sea hover:text-navy"
                disabled={isPending}
                onClick={closeModal}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <form className="max-h-[72vh] overflow-y-auto bg-[#f8fafb] p-5" onSubmit={handleSubmit} ref={formRef}>
              <input name="role_id" type="hidden" value={role.id} />

              <div className="grid gap-4">
                <div className="rounded-xl border border-[#d6e1ea] bg-white p-4">
                  <h3 className="mb-4 text-sm font-medium text-navy">Identidad del cargo</h3>
                  <div className="grid gap-3 md:grid-cols-[1fr_220px]">
                    <Field label="Nombre del cargo">
                      <input className={inputClass} defaultValue={role.title} name="name" required />
                    </Field>
                    <Field label="Nivel">
                      <select className={inputClass} defaultValue={levelValue(role.level)} name="level">
                        {roleLevelOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <div className="mt-3 rounded-lg border border-[#d6e1ea] bg-[#f8fafb] px-3 py-2 text-sm text-slate-600">
                    Area actual: <span className="font-medium text-navy">{role.area}</span>
                  </div>
                </div>

                <div className="rounded-xl border border-[#d6e1ea] bg-white p-4">
                  <h3 className="mb-4 text-sm font-medium text-navy">Asignacion y jerarquia</h3>
                  <div className="grid gap-3 md:grid-cols-2">
                    {people.length > 0 ? (
                      <Field label="Persona actual">
                        <select className={inputClass} defaultValue={currentPersonValue(role, people)} name="person_id">
                          <option value="">Sin persona asignada</option>
                          {people.map((person) => (
                            <option key={person.id} value={person.id}>
                              {person.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                    ) : (
                      <div className="rounded-lg border border-[#d6e1ea] bg-[#f8fafb] px-3 py-2 text-sm text-slate-600">
                        Persona actual: <span className="font-medium text-navy">{role.person}</span>
                      </div>
                    )}

                    {roles.length > 0 ? (
                      <Field label="Reporta a / cargo superior">
                        <select className={inputClass} defaultValue={role.orgParentRoleId ?? ""} name="org_parent_role_id">
                          <option value="">Nivel superior</option>
                          {roles
                            .filter((item) => item.id && item.id !== role.id)
                            .map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.title}
                                {item.code ? ` (${item.code})` : ""}
                              </option>
                            ))}
                        </select>
                      </Field>
                    ) : (
                      <div className="rounded-lg border border-[#d6e1ea] bg-[#f8fafb] px-3 py-2 text-sm text-slate-600">
                        Jerarquia actual conservada.
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-[#d6e1ea] bg-white p-4">
                  <h3 className="mb-4 text-sm font-medium text-navy">Proposito y responsabilidades</h3>
                  <div className="grid gap-3">
                    <Field label="Objetivo / descripcion">
                      <textarea className={`${inputClass} min-h-24`} defaultValue={role.objective} name="description" />
                    </Field>
                    <Field label="Responsabilidades">
                      <textarea
                        className={`${inputClass} min-h-28`}
                        defaultValue={role.responsibilities.join("\n")}
                        name="responsibilities"
                        placeholder="Una responsabilidad por linea"
                      />
                    </Field>
                  </div>
                </div>

                <div className="rounded-xl border border-[#d6e1ea] bg-white p-4">
                  <h3 className="mb-3 text-sm font-medium text-navy">Alcance</h3>
                  <p className="rounded-lg border border-[#d6e1ea] bg-[#f8fafb] px-3 py-2 text-sm leading-5 text-slate-600">
                    El alcance actual se conserva. La edicion de alcance se habilitara en una etapa posterior.
                  </p>
                </div>

                {error ? (
                  <p className="rounded-lg border border-[#ffd6b0] bg-[#fff7ed] px-3 py-2 text-sm text-[#9a4a16]">
                    {error}
                  </p>
                ) : null}

                <div className="flex flex-wrap justify-end gap-2 rounded-xl border border-[#d6e1ea] bg-white p-4">
                  <button
                    className="rounded-lg border border-[#cbd8e3] bg-white px-4 py-2 text-sm font-medium text-navy transition hover:bg-[#f6f8fa]"
                    disabled={isPending || isArchivePending}
                    onClick={closeModal}
                    type="button"
                  >
                    Cancelar
                  </button>
                  <button
                    className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white transition hover:bg-[#052a5a] disabled:cursor-wait disabled:opacity-70"
                    disabled={isPending || isArchivePending}
                    type="submit"
                  >
                    {isPending ? "Guardando..." : "Guardar cargo"}
                  </button>
                </div>

                <div className="rounded-xl border border-[#f0d2b8] bg-[#fff7ed] p-4">
                  <h3 className="text-sm font-medium text-[#9a4a16]">Zona administrativa</h3>
                  <p className="mt-1 text-xs leading-5 text-[#9a4a16]">
                    Archivar este cargo lo quitara de los cargos activos y lo conservara como historial.
                  </p>
                  <div className="mt-3">
                    <button
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#f0c6a4] bg-[#fff7ed] px-4 py-2 text-sm font-medium text-[#9a4a16] transition hover:bg-[#ffedd5] disabled:cursor-wait disabled:opacity-70"
                      disabled={isPending || isArchivePending}
                      onClick={() => {
                        setArchiveError(null);
                        setConfirmArchiveOpen(true);
                      }}
                      type="button"
                    >
                      <Archive className="h-4 w-4" />
                      Archivar cargo
                    </button>
                  </div>
                  {archiveError ? (
                    <p className="mt-3 rounded-lg border border-[#ffd6b0] bg-[#fff7ed] px-3 py-2 text-sm text-[#9a4a16]">
                      {archiveError}
                    </p>
                  ) : null}
                </div>
              </div>
            </form>

            {confirmArchiveOpen ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#032b4f]/30 px-4 py-6 backdrop-blur-sm">
                <section
                  aria-labelledby={`role-archive-confirm-${role.id}`}
                  aria-modal="true"
                  className="w-full max-w-md rounded-2xl border border-[#cbd8e3] bg-white shadow-[0_24px_70px_rgba(2,53,116,0.20)]"
                  role="dialog"
                >
                  <header className="border-b border-[#d6e1ea] px-5 py-4">
                    <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#8a5b2d]">
                      Zona administrativa
                    </p>
                    <h3
                      className="mt-1 text-lg font-medium text-navy"
                      id={`role-archive-confirm-${role.id}`}
                    >
                      Archivar cargo
                    </h3>
                  </header>
                  <div className="grid gap-4 p-5">
                    <p className="text-sm leading-6 text-slate-700">
                      Este cargo dejara de aparecer como activo en el organigrama y en la lista de cargos activos. Se conservara como historial en Roles / cargos archivados. Esta accion no elimina definitivamente el cargo.
                    </p>
                    {archiveError ? (
                      <p className="rounded-lg border border-[#ffd6b0] bg-[#fff7ed] px-3 py-2 text-sm text-[#9a4a16]">
                        {archiveError}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        className="rounded-lg border border-[#cbd8e3] bg-white px-4 py-2 text-sm font-medium text-navy transition hover:bg-[#f6f8fa]"
                        disabled={isArchivePending}
                        onClick={() => setConfirmArchiveOpen(false)}
                        type="button"
                      >
                        Cancelar
                      </button>
                      <button
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#e5d2bf] bg-[#fff8ef] px-4 py-2 text-sm font-medium text-[#8a5b2d] transition hover:border-[#d9b98f] hover:bg-[#fff3e2] disabled:cursor-wait disabled:opacity-70"
                        disabled={isArchivePending}
                        onClick={handleArchive}
                        type="button"
                      >
                        <Archive className="h-4 w-4" />
                        {isArchivePending ? "Archivando..." : "Archivar cargo"}
                      </button>
                    </div>
                  </div>
                </section>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
