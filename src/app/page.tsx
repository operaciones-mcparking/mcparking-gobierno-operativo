import Link from "next/link";
import { DashboardShell, Panel } from "@/components/dashboard/shell";
import {
  getPersonBottlenecks,
  getProcessGaps,
  getProcessResponsibilities,
  getProcessSystems,
  getRoleBottlenecks,
} from "@/lib/dashboard/data";

const moduleCards = [
  {
    href: "/empresas",
    number: "2",
    title: "Empresas",
    text: "McParking como empresa principal, empresas atendidas y procesos asociados.",
  },
  {
    href: "/brechas",
    number: "3",
    title: "Brechas",
    text: "Procesos sin dueño, sin persona asignada, sin respaldo o con documentación pendiente.",
  },
  {
    href: "/procesos",
    number: "4",
    title: "Procesos",
    text: "Relacion proceso, subproceso, responsabilidad, rol y persona actual.",
  },
  {
    href: "/roles-personas",
    number: "5",
    title: "Roles y personas",
    text: "Carga por rol y concentración de responsabilidades por persona.",
  },
  {
    href: "/sistemas",
    number: "6",
    title: "Sistemas",
    text: "Sistemas asociados a procesos, roles dueños y personas responsables.",
  },
];

export default async function Home() {
  const [gaps, responsibilities, roles, people, systems] = await Promise.all([
    getProcessGaps(),
    getProcessResponsibilities(),
    getRoleBottlenecks(),
    getPersonBottlenecks(),
    getProcessSystems(),
  ]);

  const alerts = [
    {
      label: "Procesos sin dueño",
      value: gaps.data.filter((gap) => gap.missing_owner_role).length,
      tone: "risk",
    },
    {
      label: "Procesos sin respaldo",
      value: gaps.data.filter((gap) => gap.missing_backup_role).length,
      tone: "risk",
    },
    {
      label: "Roles sin persona de respaldo",
      value: roles.data.filter((role) => role.missing_backup_person).length,
      tone: "risk",
    },
    {
      label: "Personas con mas de 1 rol",
      value: people.data.filter((person) => person.role_count > 1).length,
      tone: "watch",
    },
    {
      label: "Procesos criticos",
      value: gaps.data.filter((gap) =>
        ["high", "critical"].includes(gap.criticality.toLowerCase()),
      ).length,
      tone: "monitor",
    },
  ];

  return (
    <DashboardShell
      description="Portada ejecutiva para revisar salud operacional y navegar por módulos de detalle."
      eyebrow="1 Resumen"
      title="Red de Roles, Procesos, Áreas y Responsables"
    >
      <Panel
        count={`${alerts.reduce((total, alert) => total + alert.value, 0)} senales`}
        title="Alertas ejecutivas"
      >
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {alerts.map((alert) => (
            <div className="rounded-xl border border-[#d7e3ec] bg-[#f6f9fb] p-4 transition hover:bg-white hover:shadow-[0_10px_24px_rgba(0,59,92,0.05)]" key={alert.label}>
              <p className="text-sm font-medium leading-5 text-slate-600">{alert.label}</p>
              <div className="mt-4 flex items-end justify-between gap-3">
                <span className="text-3xl font-bold text-navy">{alert.value}</span>
                <span
                  className={`rounded px-2 py-1 text-xs font-semibold ${
                    alert.tone === "risk"
                      ? "bg-[#ffe6ca] text-[#86510d]"
                      : alert.tone === "watch"
                        ? "bg-[#fff2c9] text-[#755300]"
                        : "bg-[#e4f4ea] text-[#24613d]"
                  }`}
                >
                  {alert.value === 0
                    ? "OK"
                    : alert.tone === "monitor"
                      ? "Monitorear"
                      : "Revisar"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {moduleCards.map((card) => (
          <Link
            className="rounded-2xl border border-[#d7e3ec] bg-white p-5 shadow-[0_12px_32px_rgba(0,59,92,0.05)] transition hover:-translate-y-0.5 hover:border-sea hover:shadow-[0_18px_40px_rgba(0,59,92,0.09)]"
            href={card.href}
            key={card.href}
          >
            <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-xl bg-[#fff1dc] px-2 text-sm font-black text-[#86510d]">
              {card.number}
            </span>
            <h2 className="mt-3 text-lg font-bold text-navy">{card.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{card.text}</p>
          </Link>
        ))}
      </section>

      <Panel title="Estado del modelo">
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-xl border border-[#d7e3ec] bg-[#f6f9fb] p-4">
            <p className="text-sm text-slate-600">Procesos</p>
            <p className="mt-2 text-2xl font-bold text-navy">{gaps.data.length}</p>
          </div>
          <div className="rounded-xl border border-[#d7e3ec] bg-[#f6f9fb] p-4">
            <p className="text-sm text-slate-600">Responsabilidades</p>
            <p className="mt-2 text-2xl font-bold text-navy">{responsibilities.data.length}</p>
          </div>
          <div className="rounded-xl border border-[#d7e3ec] bg-[#f6f9fb] p-4">
            <p className="text-sm text-slate-600">Roles</p>
            <p className="mt-2 text-2xl font-bold text-navy">{roles.data.length}</p>
          </div>
          <div className="rounded-xl border border-[#d7e3ec] bg-[#f6f9fb] p-4">
            <p className="text-sm text-slate-600">Personas</p>
            <p className="mt-2 text-2xl font-bold text-navy">{people.data.length}</p>
          </div>
          <div className="rounded-xl border border-[#d7e3ec] bg-[#f6f9fb] p-4">
            <p className="text-sm text-slate-600">Sistemas asociados</p>
            <p className="mt-2 text-2xl font-bold text-navy">{systems.data.length}</p>
          </div>
        </div>
      </Panel>
    </DashboardShell>
  );
}
