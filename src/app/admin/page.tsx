import Link from "next/link";
import {
  criticalityOptions,
  documentationOptions,
  responsibilityOptions,
  roleLevelOptions,
} from "@/components/dashboard/badge";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  addArea,
  addPerson,
  addProcess,
  addRole,
  addSubprocess,
  addSystem,
  assignPersonRole,
  assignProcessRole,
  assignProcessSystem,
} from "./actions";

type SearchParams = Promise<{
  ok?: string;
  error?: string;
}>;

type IdName = {
  id: string;
  name: string;
};

type ProcessOption = IdName & {
  company_id: string;
};

type SubprocessOption = IdName & {
  process_id: string;
};

async function getAdminOptions() {
  const supabase = createSupabaseServerClient();
  const [
    companies,
    areas,
    processes,
    subprocesses,
    roles,
    people,
    systems,
    sites,
  ] = await Promise.all([
    supabase.from("companies").select("id,name").order("name"),
    supabase.from("areas").select("id,name").order("name"),
    supabase.from("processes").select("id,name,company_id").order("name"),
    supabase.from("subprocesses").select("id,name,process_id").order("name"),
    supabase.from("roles").select("id,name").order("name"),
    supabase.from("people").select("id,name").order("name"),
    supabase.from("systems").select("id,name").order("name"),
    supabase.from("sites").select("id,name").order("name"),
  ]);

  const firstError = [
    companies.error,
    areas.error,
    processes.error,
    subprocesses.error,
    roles.error,
    people.error,
    systems.error,
    sites.error,
  ].find(Boolean);

  if (firstError) {
    throw new Error(firstError.message);
  }

  return {
    companies: (companies.data ?? []) as IdName[],
    areas: (areas.data ?? []) as IdName[],
    processes: (processes.data ?? []) as ProcessOption[],
    subprocesses: (subprocesses.data ?? []) as SubprocessOption[],
    roles: (roles.data ?? []) as IdName[],
    people: (people.data ?? []) as IdName[],
    systems: (systems.data ?? []) as IdName[],
    sites: (sites.data ?? []) as IdName[],
  };
}

function Field({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-600">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-sea"
    />
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className="min-h-20 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-sea"
    />
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-sea"
    />
  );
}

function Submit({ children }: { children: React.ReactNode }) {
  return (
    <button
      className="rounded-md bg-sea px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#245c69]"
      type="submit"
    >
      {children}
    </button>
  );
}

function Card({
  action,
  children,
  title,
}: {
  action: (formData: FormData) => Promise<void>;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <form action={action} className="rounded-lg border border-line bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-4 grid gap-4">{children}</div>
    </form>
  );
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const options = await getAdminOptions();

  return (
    <main className="min-h-screen bg-[#f7f8f5] px-6 py-8 text-ink">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sea">
              Carga operativa
            </p>
            <h1 className="mt-3 text-4xl font-semibold">Administracion base</h1>
            <p className="mt-3 max-w-2xl leading-7 text-slate-700">
              Formularios minimos para crear entidades y relaciones del modelo.
            </p>
          </div>
          <Link
            className="rounded-md border border-line bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-sea hover:text-sea"
            href="/"
          >
            Ver dashboard
          </Link>
        </div>

        {params.ok ? (
          <div className="mt-6 rounded-md border border-[#cbdcc9] bg-[#edf6ec] p-4 text-sm font-medium text-[#405f3a]">
            {params.ok}
          </div>
        ) : null}
        {params.error ? (
          <div className="mt-6 rounded-md border border-[#e6b8a6] bg-[#fff4ef] p-4 text-sm font-medium text-[#91472b]">
            {params.error}
          </div>
        ) : null}

        <section className="mt-8 grid gap-5 lg:grid-cols-2">
          <Card action={addArea} title="Agregar area">
            <Field label="Empresa">
              <Select name="company_id" required>
                {options.companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Nombre">
              <Input name="name" required />
            </Field>
            <Field label="Descripcion">
              <Textarea name="description" />
            </Field>
            <Submit>Guardar area</Submit>
          </Card>

          <Card action={addPerson} title="Agregar persona">
            <Field label="Nombre">
              <Input name="name" required />
            </Field>
            <Field label="Email">
              <Input name="email" type="email" />
            </Field>
            <Field label="Telefono">
              <Input name="phone" />
            </Field>
            <Submit>Guardar persona</Submit>
          </Card>

          <Card action={addProcess} title="Agregar proceso">
            <Field label="Empresa">
              <Select name="company_id" required>
                {options.companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Area">
              <Select name="area_id">
                <option value="">Sin area</option>
                {options.areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Nombre">
              <Input name="name" required />
            </Field>
            <Field label="Descripcion">
              <Textarea name="description" />
            </Field>
            <Field label="Objetivo">
              <Textarea name="objective" />
            </Field>
            <Field label="Resultado esperado">
              <Textarea name="expected_result" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Criticidad">
                <Select name="criticality" defaultValue="medium">
                  {criticalityOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Documentacion">
                <Select name="documentation_status" defaultValue="draft">
                  {documentationOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input name="is_replicable" type="checkbox" /> Replicable
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input name="is_global" type="checkbox" /> Global
            </label>
            <Submit>Guardar proceso</Submit>
          </Card>

          <Card action={addSubprocess} title="Agregar subproceso">
            <Field label="Proceso">
              <Select name="process_id" required>
                {options.processes.map((process) => (
                  <option key={process.id} value={process.id}>
                    {process.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Nombre">
              <Input name="name" required />
            </Field>
            <Field label="Frecuencia">
              <Input name="frequency" />
            </Field>
            <Field label="Criticidad">
              <Select name="criticality" defaultValue="medium">
                {criticalityOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Descripcion">
              <Textarea name="description" />
            </Field>
            <Submit>Guardar subproceso</Submit>
          </Card>

          <Card action={addRole} title="Agregar rol">
            <Field label="Area">
              <Select name="area_id">
                <option value="">Sin area</option>
                {options.areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Nombre">
              <Input name="name" required />
            </Field>
            <Field label="Nivel">
              <Select name="level" defaultValue="operational">
                {roleLevelOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Descripcion">
              <Textarea name="description" />
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input defaultChecked name="is_corporate" type="checkbox" /> Corporativo
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input name="is_local" type="checkbox" /> Local
            </label>
            <Submit>Guardar rol</Submit>
          </Card>

          <Card action={addSystem} title="Agregar sistema">
            <Field label="Nombre">
              <Input name="name" required />
            </Field>
            <Field label="Rol dueño">
              <Select name="owner_role_id">
                <option value="">Sin rol dueño</option>
                {options.roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Descripcion">
              <Textarea name="description" />
            </Field>
            <Submit>Guardar sistema</Submit>
          </Card>

          <Card action={assignPersonRole} title="Asignar persona a rol">
            <Field label="Persona">
              <Select name="person_id" required>
                {options.people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Rol">
              <Select name="role_id" required>
                {options.roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Empresa">
              <Select name="company_id" required>
                {options.companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Sede">
              <Select name="site_id">
                <option value="">Sin sede</option>
                {options.sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Fecha inicio">
              <Input name="start_date" type="date" />
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input defaultChecked name="is_primary" type="checkbox" /> Principal
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input name="is_backup" type="checkbox" /> Respaldo
            </label>
            <Submit>Asignar persona</Submit>
          </Card>

          <Card action={assignProcessRole} title="Asociar rol a proceso">
            <Field label="Proceso">
              <Select name="process_id" required>
                {options.processes.map((process) => (
                  <option key={process.id} value={process.id}>
                    {process.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Subproceso">
              <Select name="subprocess_id">
                <option value="">Proceso completo</option>
                {options.subprocesses.map((subprocess) => (
                  <option key={subprocess.id} value={subprocess.id}>
                    {subprocess.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Rol">
              <Select name="role_id" required>
                {options.roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Responsabilidad">
                <Select name="responsibility_type" defaultValue="responsible">
                  {responsibilityOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Criticidad">
                <Select name="criticality" defaultValue="medium">
                  {criticalityOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Impacto %">
              <Input max={100} min={0} name="impact_percent" type="number" />
            </Field>
            <Field label="Notas">
              <Textarea name="notes" />
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input defaultChecked name="is_required" type="checkbox" /> Requerido
            </label>
            <Submit>Asociar rol</Submit>
          </Card>

          <Card action={assignProcessSystem} title="Asociar sistema a proceso">
            <Field label="Proceso">
              <Select name="process_id" required>
                {options.processes.map((process) => (
                  <option key={process.id} value={process.id}>
                    {process.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Subproceso">
              <Select name="subprocess_id">
                <option value="">Proceso completo</option>
                {options.subprocesses.map((subprocess) => (
                  <option key={subprocess.id} value={subprocess.id}>
                    {subprocess.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Sistema">
              <Select name="system_id" required>
                {options.systems.map((system) => (
                  <option key={system.id} value={system.id}>
                    {system.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Notas">
              <Textarea name="notes" />
            </Field>
            <Submit>Asociar sistema</Submit>
          </Card>
        </section>
      </div>
    </main>
  );
}
