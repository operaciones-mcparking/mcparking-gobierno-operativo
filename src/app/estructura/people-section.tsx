import { archivePerson, updatePersonBasic } from "@/app/admin/actions";
import { ConfirmSubmitButton } from "@/components/dashboard/confirm-submit-button";
import type { PersonDirectoryItem } from "@/lib/dashboard/data";

const inputClass =
  "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none transition focus:border-sea focus:ring-2 focus:ring-[#e6edf3]";

const archiveButtonClass =
  "rounded-lg border border-[#f0c6a4] bg-[#fff7ed] px-4 py-2 text-sm font-medium text-[#9a4a16] transition hover:bg-[#ffedd5]";

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

function statusLabel(status: string) {
  if (status === "active") return "Activo";
  if (status === "archived") return "Archivado";
  return status || "Sin estado";
}

export function PeopleSection({
  canArchive,
  canCreate,
  canEdit,
  people,
  returnTo,
}: {
  canArchive: boolean;
  canCreate: boolean;
  canEdit: boolean;
  people: PersonDirectoryItem[];
  returnTo: string;
}) {
  const activePeople = people.filter((person) => person.status === "active");

  return (
    <div className="mt-5 grid gap-4">
      <div className="flex flex-col justify-between gap-4 rounded-xl border border-line bg-[#f8fafb] p-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-medium text-navy">Personas del modelo operativo</p>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
            Lista activa de personas asociadas a roles funcionales, procesos y responsabilidades.
          </p>
        </div>
        <div className="sm:text-right">
          <button
            className="rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium text-slate-400"
            disabled
            title="Agregar persona estara disponible en la siguiente etapa."
            type="button"
          >
            Agregar persona
          </button>
          <p className="mt-2 max-w-xs text-xs text-slate-500">
            {canCreate
              ? "Agregar persona estara disponible en la siguiente etapa."
              : "Agregar persona requiere permisos de administracion y estara disponible en la siguiente etapa."}
          </p>
        </div>
      </div>

      {activePeople.length === 0 ? (
        <div className="rounded-xl border border-line bg-white p-5 text-sm text-slate-600">
          No hay personas activas para este contexto.
        </div>
      ) : (
        <div className="grid gap-3">
          {activePeople.map((person) => (
            <details
              className="group overflow-hidden rounded-xl border border-line bg-white shadow-sm"
              key={person.id}
            >
              <summary className="cursor-pointer list-none p-4 transition hover:bg-[#f8fafb]">
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
                  <div className="text-sm font-medium text-sea">
                    {canEdit || canArchive ? "Administrar" : "Ver detalle"}
                  </div>
                </div>
              </summary>

              {canEdit ? (
                <form action={updatePersonBasic} className="grid gap-3 border-t border-line bg-[#f8fafb] p-4">
                  <input name="person_id" type="hidden" value={person.id} />
                  <input name="return_to" type="hidden" value={returnTo} />
                  <div className="rounded-xl border border-line bg-white p-4">
                    <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">
                      <Field label="Nombre">
                        <input className={inputClass} name="name" required defaultValue={person.name} />
                      </Field>
                      <Field label="Email">
                        <input className={inputClass} name="email" defaultValue={person.email ?? ""} />
                      </Field>
                      <Field label="Telefono">
                        <input className={inputClass} name="phone" defaultValue={person.phone ?? ""} />
                      </Field>
                      <button
                        className="rounded-lg bg-sea px-4 py-2 text-sm font-medium text-white transition hover:bg-[#1d5b6a]"
                        type="submit"
                      >
                        Guardar persona
                      </button>
                    </div>
                  </div>
                </form>
              ) : null}

              {canArchive ? (
                <form
                  action={archivePerson}
                  className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-white px-4 py-3"
                >
                  <input name="person_id" type="hidden" value={person.id} />
                  <input name="return_to" type="hidden" value={returnTo} />
                  <p className="text-xs text-slate-500">
                    Archivar desasigna sus roles activos y la oculta de las listas.
                  </p>
                  <ConfirmSubmitButton
                    className={archiveButtonClass}
                    message={`Vas a archivar a "${person.name}". Se desasignaran sus roles activos y se ocultara de las listas. Deseas continuar?`}
                    title="Archivar persona"
                  >
                    Archivar persona
                  </ConfirmSubmitButton>
                </form>
              ) : null}
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
