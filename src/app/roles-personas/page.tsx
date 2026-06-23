import { optionLabel, roleLevelOptions } from "@/components/dashboard/badge";
import { DashboardShell, Panel, StatusPill } from "@/components/dashboard/shell";
import { getPersonBottlenecks, getRoleBottlenecks } from "@/lib/dashboard/data";

export default async function RolesPersonasPage() {
  const [rolesResult, peopleResult] = await Promise.all([
    getRoleBottlenecks(),
    getPersonBottlenecks(),
  ]);

  return (
    <DashboardShell
      description="Carga acumulada por rol y por persona para detectar concentración de responsabilidad."
      eyebrow="5 Roles y personas"
      title="Roles y personas"
    >
      <Panel count={`${rolesResult.data.length} roles`} title="Vista por rol">
        {rolesResult.error ? (
          <div className="mt-5 rounded-md border border-[#e6b8a6] bg-[#fff4ef] p-4 text-sm text-[#91472b]">
            {rolesResult.error.message}
          </div>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-line text-slate-500">
                  <th className="py-3 pr-4 font-semibold">Rol</th>
                  <th className="py-3 pr-4 font-semibold">Nivel</th>
                  <th className="py-3 pr-4 font-semibold">Tipo</th>
                  <th className="py-3 pr-4 font-semibold">Procesos</th>
                  <th className="py-3 pr-4 font-semibold">Críticos</th>
                  <th className="py-3 pr-4 font-semibold">Dueño</th>
                  <th className="py-3 pr-4 font-semibold">Aprobador</th>
                  <th className="py-3 pr-4 font-semibold">Sistemas</th>
                  <th className="py-3 font-semibold">Sin persona de respaldo</th>
                </tr>
              </thead>
              <tbody>
                {rolesResult.data.map((role) => (
                  <tr className="border-b border-line last:border-0" key={role.role_id}>
                    <td className="py-4 pr-4 font-medium">{role.role_name}</td>
                    <td className="py-4 pr-4">
                      {optionLabel(roleLevelOptions, role.role_level)}
                    </td>
                    <td className="py-4 pr-4">
                      {role.is_corporate ? "Corporativo" : role.is_local ? "Local" : "Mixto"}
                    </td>
                    <td className="py-4 pr-4">{role.process_count}</td>
                    <td className="py-4 pr-4">{role.critical_process_count}</td>
                    <td className="py-4 pr-4">{role.owner_responsibility_count}</td>
                    <td className="py-4 pr-4">{role.approver_responsibility_count}</td>
                    <td className="py-4 pr-4">{role.system_count}</td>
                    <td className="py-4">
                      <StatusPill active={role.missing_backup_person} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel count={`${peopleResult.data.length} personas`} title="Vista por persona">
        {peopleResult.error ? (
          <div className="mt-5 rounded-md border border-[#e6b8a6] bg-[#fff4ef] p-4 text-sm text-[#91472b]">
            {peopleResult.error.message}
          </div>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-line text-slate-500">
                  <th className="py-3 pr-4 font-semibold">Persona</th>
                  <th className="py-3 pr-4 font-semibold">Roles</th>
                  <th className="py-3 pr-4 font-semibold">Procesos</th>
                  <th className="py-3 pr-4 font-semibold">Críticos</th>
                  <th className="py-3 pr-4 font-semibold">Sistemas</th>
                  <th className="py-3 font-semibold">Respaldos cubiertos</th>
                </tr>
              </thead>
              <tbody>
                {peopleResult.data.map((person) => (
                  <tr className="border-b border-line last:border-0" key={person.person_id}>
                    <td className="py-4 pr-4 font-medium">{person.person_name}</td>
                    <td className="py-4 pr-4">{person.role_count}</td>
                    <td className="py-4 pr-4">{person.process_count}</td>
                    <td className="py-4 pr-4">{person.critical_process_count}</td>
                    <td className="py-4 pr-4">{person.system_count}</td>
                    <td className="py-4">{person.backup_assignment_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </DashboardShell>
  );
}
