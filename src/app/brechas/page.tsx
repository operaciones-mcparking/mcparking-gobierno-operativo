import { TypedBadge } from "@/components/dashboard/badge";
import { DashboardShell, Panel, StatusPill } from "@/components/dashboard/shell";
import { getProcessGaps } from "@/lib/dashboard/data";

export default async function BrechasPage() {
  const { data: gaps, error } = await getProcessGaps();

  return (
    <DashboardShell
      description="Procesos que requieren acción por falta de dueño, persona asignada, respaldo o documentación."
      eyebrow="3 Brechas"
      title="Brechas organizacionales"
    >
      <Panel count={`${gaps.length} procesos`} title="Procesos y brechas">
        {error ? (
          <div className="mt-5 rounded-md border border-[#e6b8a6] bg-[#fff4ef] p-4 text-sm text-[#91472b]">
            {error.message}
          </div>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-line text-slate-500">
                  <th className="py-3 pr-4 font-semibold">Proceso</th>
                  <th className="py-3 pr-4 font-semibold">Criticidad</th>
                  <th className="py-3 pr-4 font-semibold">Documentacion</th>
                  <th className="py-3 pr-4 font-semibold">Sin rol dueño</th>
                  <th className="py-3 pr-4 font-semibold">Sin persona dueña</th>
                  <th className="py-3 pr-4 font-semibold">Sin respaldo</th>
                  <th className="py-3 font-semibold">Brecha docs</th>
                </tr>
              </thead>
              <tbody>
                {gaps.map((gap) => (
                  <tr className="border-b border-line last:border-0" key={gap.process_id}>
                    <td className="py-4 pr-4 font-medium">{gap.process_name}</td>
                    <td className="py-4 pr-4">
                      <TypedBadge type="criticality" value={gap.criticality} />
                    </td>
                    <td className="py-4 pr-4">
                      <TypedBadge type="documentation" value={gap.documentation_status} />
                    </td>
                    <td className="py-4 pr-4">
                      <StatusPill active={gap.missing_owner_role} />
                    </td>
                    <td className="py-4 pr-4">
                      <StatusPill active={gap.missing_owner_person} />
                    </td>
                    <td className="py-4 pr-4">
                      <StatusPill active={gap.missing_backup_role} />
                    </td>
                    <td className="py-4">
                      <StatusPill active={gap.documentation_gap} />
                    </td>
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
