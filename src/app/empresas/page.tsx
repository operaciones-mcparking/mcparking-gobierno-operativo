import { Building2, Network, Workflow } from "lucide-react";

import { TypedBadge } from "@/components/dashboard/badge";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/dashboard/data-table";
import { DashboardShell, Panel } from "@/components/dashboard/shell";
import { getCompanyServiceNetwork } from "@/lib/dashboard/data";

export default async function EmpresasPage() {
  const { data: relationships, error } = await getCompanyServiceNetwork();
  const providerName = relationships[0]?.provider_company_name ?? "McParking";
  const servedCompanies = relationships.filter(
    (relationship) => relationship.relationship_status === "active",
  );
  const processTotal = servedCompanies.reduce(
    (sum, relationship) => sum + Number(relationship.process_count ?? 0),
    0,
  );

  return (
    <DashboardShell
      description="Estructura de empresa principal, empresas atendidas y procesos asociados."
      eyebrow={`${servedCompanies.length} empresas atendidas`}
      title="Empresas y servicios"
    >
      {error ? (
        <div className="mt-5 rounded-lg border border-[#f2c5b8] bg-[#fff7f4] p-4 text-sm font-semibold text-[#91472b]">
          No se pudo leer la vista v_company_service_network. Ejecuta primero la migracion de
          empresas y servicios.
        </div>
      ) : null}

      <section className="mt-5 grid gap-4 lg:grid-cols-[1fr_2fr]">
        <div className="rounded-xl border border-[#d6e1ea] bg-white p-5 shadow-[0_8px_18px_rgba(2,53,116,0.035)]">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-md bg-ink text-white">
              <Building2 className="h-6 w-6" />
            </span>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-sea">
                Empresa principal
              </p>
              <h2 className="text-xl font-medium text-navy">{providerName}</h2>
            </div>
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-700">
            McParking opera como empresa base y puede prestar servicios operativos,
            administrativos o comerciales a otras empresas.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-[#d6e1ea] bg-white p-4 shadow-[0_8px_18px_rgba(2,53,116,0.035)]">
            <p className="text-sm font-medium text-slate-500">Empresas atendidas</p>
            <p className="mt-2 text-2xl font-medium text-navy">{servedCompanies.length}</p>
          </div>
          <div className="rounded-xl border border-[#d6e1ea] bg-white p-4 shadow-[0_8px_18px_rgba(2,53,116,0.035)]">
            <p className="text-sm font-medium text-slate-500">Procesos vinculados</p>
            <p className="mt-2 text-2xl font-medium text-navy">{processTotal}</p>
          </div>
          <div className="rounded-xl border border-[#d6e1ea] bg-white p-4 shadow-[0_8px_18px_rgba(2,53,116,0.035)]">
            <p className="text-sm font-medium text-slate-500">Modelo</p>
            <p className="mt-2 text-lg font-medium text-navy">Proveedor &gt; cliente</p>
          </div>
        </div>
      </section>

      <Panel count={`${servedCompanies.length} relaciones`} title="Red de empresas">
        <div className="mt-4">
          <DataTable minWidth="760px">
            <DataTableHead>
              <tr>
                <DataTableHeaderCell>Empresa atendida</DataTableHeaderCell>
                <DataTableHeaderCell>Relacion</DataTableHeaderCell>
                <DataTableHeaderCell>Procesos asociados</DataTableHeaderCell>
                <DataTableHeaderCell>Estado</DataTableHeaderCell>
                <DataTableHeaderCell>Notas</DataTableHeaderCell>
              </tr>
            </DataTableHead>
            <DataTableBody>
              {servedCompanies.map((relationship) => (
                <DataTableRow key={relationship.client_company_id}>
                  <DataTableCell>
                    <p className="font-semibold">{relationship.client_company_name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Atendida por {relationship.provider_company_name}
                    </p>
                  </DataTableCell>
                  <DataTableCell>
                    <TypedBadge type="relationship" value={relationship.relationship_type} />
                  </DataTableCell>
                  <DataTableCell>
                    <div className="flex items-start gap-2">
                      <Workflow className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                      <span>{relationship.processes ?? "Sin procesos vinculados"}</span>
                    </div>
                  </DataTableCell>
                  <DataTableCell>
                    <TypedBadge type="status" value={relationship.relationship_status} />
                  </DataTableCell>
                  <DataTableCell>
                    {relationship.relationship_description ?? "Sin notas"}
                  </DataTableCell>
                </DataTableRow>
              ))}
              {servedCompanies.length === 0 ? (
                <tr>
                  <td className="py-6 text-slate-500" colSpan={5}>
                    Todavia no hay empresas atendidas cargadas.
                  </td>
                </tr>
              ) : null}
            </DataTableBody>
          </DataTable>
        </div>
      </Panel>

      <Panel title="Lectura operativa">
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-[#d6e1ea] bg-white p-4">
            <Network className="h-5 w-5 text-sea" />
            <h3 className="mt-3 font-semibold">Empresa base</h3>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              McParking concentra la estructura de roles, procesos, personas y sistemas.
            </p>
          </div>
          <div className="rounded-xl border border-[#d6e1ea] bg-white p-4">
            <Building2 className="h-5 w-5 text-sea" />
            <h3 className="mt-3 font-semibold">Empresas cliente</h3>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              El Alba, Los Cumas y Rixtath EIRL quedan registradas como empresas atendidas.
            </p>
          </div>
          <div className="rounded-xl border border-[#d6e1ea] bg-white p-4">
            <Workflow className="h-5 w-5 text-sea" />
            <h3 className="mt-3 font-semibold">Procesos aplicables</h3>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              Un proceso puede quedar asociado a una o varias empresas atendidas sin duplicar
              el proceso base.
            </p>
          </div>
        </div>
      </Panel>
    </DashboardShell>
  );
}
