"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { createPortal } from "react-dom";
import { PencilLine, X } from "lucide-react";

import { archivePerson, updatePersonBasic } from "@/app/admin/actions";
import type { PersonDirectoryItem } from "@/lib/dashboard/data";

const inputClass =
  "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none transition focus:border-sea focus:ring-2 focus:ring-[#e6edf3]";

const archiveButtonClass =
  "rounded-lg border border-[#f0c6a4] bg-[#fff7ed] px-4 py-2 text-sm font-medium text-[#9a4a16] transition hover:bg-[#ffedd5]";

function statusLabel(status: string) {
  if (status === "active") return "Activo";
  if (status === "archived") return "Archivado";
  return status || "Sin estado";
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

function DetailCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-[#d6e1ea] bg-[#f8fafb] p-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-medium text-navy">{value}</p>
    </div>
  );
}

function SavePersonButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="inline-flex items-center justify-center rounded-lg bg-sea px-4 py-2 text-sm font-medium text-white transition hover:bg-[#1d5b6a] disabled:cursor-wait disabled:opacity-70"
      disabled={pending}
      type="submit"
    >
      {pending ? "Guardando..." : "Guardar persona"}
    </button>
  );
}

function ArchivePersonButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className={archiveButtonClass}
      disabled={pending}
      type="submit"
    >
      {pending ? "Archivando..." : "Archivar persona"}
    </button>
  );
}

export function PersonDetailModal({
  canArchive,
  canEdit,
  person,
  returnTo,
  showStatusInCompact = false,
  variant = "card",
}: {
  canArchive: boolean;
  canEdit: boolean;
  person: PersonDirectoryItem;
  returnTo: string;
  showStatusInCompact?: boolean;
  variant?: "card" | "compact";
}) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false);
  const canArchiveCurrentPerson = canArchive && person.status === "active";

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <>
      {variant === "compact" ? (
        <button
          aria-label={`Ver detalle de ${person.name}`}
          className="group w-full px-4 py-3 text-left transition hover:bg-[#f8fafb]"
          onClick={() => setOpen(true)}
          type="button"
        >
          <div
            className={`grid gap-3 md:items-center ${
              showStatusInCompact
                ? "md:grid-cols-[1.2fr_1fr_0.8fr_0.7fr_auto]"
                : "md:grid-cols-[1.2fr_1fr_0.8fr_auto]"
            }`}
          >
            <div>
              <p className="text-sm font-medium text-navy">{person.name}</p>
              {showStatusInCompact ? (
                <p className="mt-1 text-xs text-slate-500 md:hidden">
                  {statusLabel(person.status)}
                </p>
              ) : null}
            </div>
            <p className="break-words text-sm text-slate-600">{person.email ?? "Sin email"}</p>
            <p className="text-sm text-slate-600">{person.phone ?? "Sin telefono"}</p>
            {showStatusInCompact ? (
              <span className="hidden rounded-full border border-[#d9e7ef] bg-[#eef7fb] px-3 py-1 text-center text-xs font-medium text-sea md:inline-flex md:justify-center">
                {statusLabel(person.status)}
              </span>
            ) : null}
            <span className="inline-flex items-center justify-center rounded-lg border border-[#cbd8e3] bg-white px-3 py-2 text-sm font-medium text-navy transition group-hover:border-sea group-hover:bg-[#eef4f8]">
              {canEdit || canArchiveCurrentPerson ? "Administrar" : "Ver detalle"}
            </span>
          </div>
        </button>
      ) : (
        <button
          aria-label={`Ver detalle de ${person.name}`}
          className="group w-full rounded-xl border border-line bg-white p-4 text-left shadow-sm transition hover:border-sea hover:bg-[#f8fafb]"
          onClick={() => setOpen(true)}
          type="button"
        >
          <div className="grid gap-4 md:grid-cols-[1.2fr_1fr_0.9fr_auto] md:items-center">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-sea">
                Persona
              </p>
              <h3 className="mt-1 text-base font-semibold text-navy">{person.name}</h3>
              <p className="mt-1 break-words text-sm text-slate-600">
                {person.email ?? "Sin email"}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Telefono</p>
              <p className="mt-1 text-sm font-medium text-navy">
                {person.phone ?? "Sin telefono"}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Estado</p>
              <span className="mt-2 inline-flex rounded-full border border-[#d9e7ef] bg-[#eef7fb] px-3 py-1 text-xs font-medium text-sea">
                {statusLabel(person.status)}
              </span>
            </div>
            <span className="inline-flex items-center justify-center rounded-lg border border-[#cbd8e3] bg-white px-3 py-2 text-sm font-medium text-navy transition group-hover:border-sea group-hover:bg-[#eef4f8]">
              {canEdit || canArchiveCurrentPerson ? "Administrar" : "Ver detalle"}
            </span>
          </div>
        </button>
      )}

      {open && mounted
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#032b4f]/45 px-4 py-6 backdrop-blur-sm">
              <button
                aria-label="Cerrar detalle"
                className="absolute inset-0"
                onClick={() => {
                  setOpen(false);
                  setEditing(false);
                  setConfirmArchiveOpen(false);
                }}
                type="button"
              />

              <section
                aria-labelledby={`person-detail-${person.id}`}
                aria-modal="true"
                className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-[#cbd8e3] bg-white shadow-[0_24px_70px_rgba(2,53,116,0.20)]"
                role="dialog"
              >
                <header className="flex items-start justify-between gap-4 border-b border-[#d6e1ea] px-5 py-4">
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-sea">
                      Detalle de persona
                    </p>
                    <h2
                      className="mt-2 text-lg font-medium leading-tight text-navy"
                      id={`person-detail-${person.id}`}
                    >
                      {person.name}
                    </h2>
                    <p className="mt-1 break-words text-sm text-slate-600">
                      {person.email ?? "Sin email registrado"}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {canEdit ? (
                      <button
                        className="inline-flex items-center gap-2 rounded-lg border border-[#cbd8e3] bg-white px-3 py-2 text-sm font-medium text-navy transition hover:border-sea hover:bg-[#eef4f8]"
                        onClick={() => setEditing((current) => !current)}
                        type="button"
                      >
                        <PencilLine className="h-4 w-4 text-sea" />
                        Editar persona
                      </button>
                    ) : null}
                    <button
                      aria-label="Cerrar"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#cbd8e3] bg-white text-slate-500 transition hover:border-sea hover:text-navy"
                      onClick={() => {
                        setOpen(false);
                        setEditing(false);
                        setConfirmArchiveOpen(false);
                      }}
                      type="button"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </header>

                <div className="max-h-[72vh] overflow-y-auto p-5">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <DetailCard label="Nombre" value={person.name} />
                    <DetailCard label="Estado" value={statusLabel(person.status)} />
                    <DetailCard label="Email" value={person.email ?? "Sin email"} />
                    <DetailCard label="Telefono" value={person.phone ?? "Sin telefono"} />
                    <DetailCard label="Tiempo en empresa" value="No definido" />
                  </div>

                  {editing && canEdit ? (
                    <div className="mt-4 grid gap-4">
                      <form action={updatePersonBasic} className="rounded-xl border border-[#d6e1ea] bg-[#f8fafb] p-4">
                        <input name="person_id" type="hidden" value={person.id} />
                        <input name="return_to" type="hidden" value={returnTo} />
                        <h3 className="text-sm font-medium text-navy">Editar persona</h3>
                        <div className="mt-4 grid gap-3">
                          <Field label="Nombre">
                            <input className={inputClass} name="name" required defaultValue={person.name} />
                          </Field>
                          <Field label="Email">
                            <input className={inputClass} name="email" defaultValue={person.email ?? ""} />
                          </Field>
                          <Field label="Telefono">
                            <input className={inputClass} name="phone" defaultValue={person.phone ?? ""} />
                          </Field>
                        </div>
                        <div className="mt-4 flex flex-wrap justify-end gap-2">
                          <button
                            className="rounded-lg border border-[#cbd8e3] bg-white px-4 py-2 text-sm font-medium text-navy transition hover:bg-[#f6f8fa]"
                            onClick={() => setEditing(false)}
                            type="button"
                          >
                            Cancelar
                          </button>
                          <SavePersonButton />
                        </div>
                      </form>

                      {canArchiveCurrentPerson ? (
                        <div className="rounded-xl border border-[#f0d2b8] bg-[#fff7ed] p-4">
                          <h3 className="text-sm font-medium text-[#9a4a16]">Zona administrativa</h3>
                          <p className="mt-1 text-xs leading-5 text-[#9a4a16]">
                            Archivar esta persona la ocultara de las listas activas y conservara su informacion como historial.
                          </p>
                          <div className="mt-3">
                            <button
                              className={archiveButtonClass}
                              onClick={() => setConfirmArchiveOpen(true)}
                              type="button"
                            >
                              Archivar persona
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {confirmArchiveOpen && editing && canArchiveCurrentPerson ? (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#032b4f]/30 px-4 py-6 backdrop-blur-sm">
                      <section
                        aria-labelledby={`person-archive-confirm-${person.id}`}
                        aria-modal="true"
                        className="w-full max-w-md rounded-2xl border border-[#cbd8e3] bg-white shadow-[0_24px_70px_rgba(2,53,116,0.20)]"
                        role="dialog"
                      >
                        <header className="border-b border-[#d6e1ea] px-5 py-4">
                          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#9a4a16]">
                            Zona administrativa
                          </p>
                          <h3
                            className="mt-1 text-lg font-medium text-navy"
                            id={`person-archive-confirm-${person.id}`}
                          >
                            Archivar persona
                          </h3>
                        </header>
                        <form action={archivePerson} className="grid gap-4 p-5">
                          <input name="person_id" type="hidden" value={person.id} />
                          <input name="return_to" type="hidden" value={returnTo} />
                          <p className="text-sm leading-6 text-slate-700">
                            Esta persona dejara de aparecer como activa y se conservara como historial. Esta accion no elimina definitivamente a la persona.
                          </p>
                          <div className="flex flex-wrap justify-end gap-2">
                            <button
                              className="rounded-lg border border-[#cbd8e3] bg-white px-4 py-2 text-sm font-medium text-navy transition hover:bg-[#f6f8fa]"
                              onClick={() => setConfirmArchiveOpen(false)}
                              type="button"
                            >
                              Cancelar
                            </button>
                            <ArchivePersonButton />
                          </div>
                        </form>
                      </section>
                    </div>
                  ) : null}
                </div>
              </section>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
