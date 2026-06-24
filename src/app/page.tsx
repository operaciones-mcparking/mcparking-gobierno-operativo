import Link from "next/link";
import {
  AlertTriangle,
  Building2,
  Database,
  GitBranch,
  ShieldCheck,
  UserRoundCheck,
  Users,
  Workflow,
} from "lucide-react";

import { DashboardShell, KpiCard, Panel } from "@/components/dashboard/shell";
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
    icon: Building2,
    number: "1",
    title: "Empresas",
    text: "McParking como empresa principal, empresas atendidas y procesos asociados.",
  },
  {
    href: "/brechas",
    icon: AlertTriangle,
    number: "2",
    title: "Brechas",
    text: "Procesos sin dueno, sin persona asignada, sin respaldo o con documentacion pendiente.",
  },
  {
    href: "/procesos",
    icon: GitBranch,
    number: "3",
    title: "Procesos",
    text: "Relacion proceso, subproceso, responsabilidad, rol y persona actual.",
  },
  {
    href: "/roles-personas",
    icon: Users,
    number: "4",
    title: "Roles y personas",
    text: "Carga por rol y concentracion de responsabilidades por persona.",
  },
  {
    href: "/sistemas",
    icon: Database,
    number: "5",
    title: "Sistemas",
    text: "Sistemas asociados a procesos, roles duenos y personas responsables.",
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
      icon: ShieldCheck,
      label: "Procesos sin dueno",
      value: gaps.data.filter((gap) => gap.missing_owner_role).length,
      tone: "risk",
    },
    {
      icon: ShieldCheck,
      label: "Procesos sin respaldo",
      value: gaps.data.filter((gap) => gap.missing_backup_role).length,
      tone: "risk",
    },
    {
      icon: UserRoundCheck,
      label: "Roles sin persona de respaldo",
      value: roles.data.filter((role) => role.missing_backup_person).length,
      tone: "risk",
    },
    {
      icon: Users,
      label: "Personas con mas de 1 rol",
      value: people.data.filter((person) => person.role_count > 1).length,
      tone: "watch",
    },
    {
      icon: Workflow,
      label: "Procesos criticos",
      value: gaps.data.filter((gap) =>
        ["high", "critical"].includes(gap.criticality.toLowerCase()),
      ).length,
      tone: "monitor",
    },
  ];

  return (
    <DashboardShell
      description="Portada ejecutiva para revisar salud operacional y navegar por modulos de detalle."
      eyebrow="Gobierno operativo"
      title="Red de Roles, Procesos, Areas y Responsables"
    >
      <Panel
        count={`${alerts.reduce((total, alert) => total + alert.value, 0)} senales`}
        title="Alertas ejecutivas"
      >
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {alerts.map((alert) => {
            const status =
              alert.value === 0 ? "OK" : alert.tone === "monitor" ? "Monitorear" : "Revisar";
            const tone =
              alert.value === 0
                ? "success"
                : alert.tone === "risk"
                  ? "danger"
                  : alert.tone === "watch"
                    ? "warning"
                    : "info";

            return (
              <KpiCard
                icon={alert.icon}
                key={alert.label}
                label={alert.label}
                status={status}
                tone={tone}
                value={alert.value}
                variation="Estado actual"
              />
            );
          })}
        </div>
      </Panel>

      <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {moduleCards.map((card) => (
          <Link
            className="group rounded-xl border border-[#d6e1ea] bg-white p-4 shadow-[0_8px_18px_rgba(2,53,116,0.035)] transition hover:border-[#9bcbdc] hover:shadow-[0_12px_24px_rgba(2,53,116,0.06)]"
            href={card.href}
            key={card.href}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#d6e1ea] bg-[#f3f8fb] text-sea transition group-hover:border-sea group-hover:bg-white">
                <card.icon className="h-4 w-4" />
              </span>
              <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-[#fff8db] px-2 text-xs font-medium text-[#765900]">
                {card.number}
              </span>
            </div>
            <h2 className="mt-3 text-sm font-medium text-navy">{card.title}</h2>
            <p className="mt-2 text-sm leading-5 text-slate-600">{card.text}</p>
          </Link>
        ))}
      </section>

      <Panel title="Estado del modelo">
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <KpiCard
            icon={GitBranch}
            label="Procesos"
            status="Modelo"
            tone="info"
            value={gaps.data.length}
          />
          <KpiCard
            icon={Workflow}
            label="Responsabilidades"
            status="Roles"
            tone="info"
            value={responsibilities.data.length}
          />
          <KpiCard
            icon={Users}
            label="Roles"
            status="Activos"
            tone="success"
            value={roles.data.length}
          />
          <KpiCard
            icon={UserRoundCheck}
            label="Personas"
            status="Actuales"
            tone="success"
            value={people.data.length}
          />
          <KpiCard
            icon={Database}
            label="Sistemas asociados"
            status="Soporte"
            tone="info"
            value={systems.data.length}
          />
        </div>
      </Panel>
    </DashboardShell>
  );
}
