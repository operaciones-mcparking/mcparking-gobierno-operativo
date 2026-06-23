import Link from "next/link";
import Image from "next/image";
import {
  AlertTriangle,
  Building2,
  Database,
  GitBranch,
  LayoutDashboard,
  PlusCircle,
  Settings,
  Users,
} from "lucide-react";

const modules = [
  { href: "/", icon: LayoutDashboard, label: "Resumen", helper: "Vista general" },
  { href: "/empresas", icon: Building2, label: "Empresas", helper: "McParking y clientes" },
  { href: "/procesos", icon: GitBranch, label: "Procesos", helper: "Modelo operativo" },
  { href: "/roles-personas", icon: Users, label: "Roles y personas", helper: "Responsabilidades" },
  { href: "/sistemas", icon: Database, label: "Sistemas", helper: "Herramientas" },
  { href: "/brechas", icon: AlertTriangle, label: "Brechas", helper: "Alertas y riesgos" },
];

function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <Image
      alt="McParking Gobierno operativo"
      className={compact ? "h-11 w-auto" : "h-14 w-auto"}
      height={64}
      src="/mcparking-logo.svg"
      width={245}
    />
  );
}

export function DashboardShell({
  background = "mist",
  children,
  eyebrow,
  title,
  description,
}: {
  background?: "mist" | "white";
  children: React.ReactNode;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <main className={`min-h-screen text-ink ${background === "white" ? "bg-white" : "bg-[#eef4f7]"}`}>
      <div className="flex min-h-screen">
        <aside className="hidden w-76 shrink-0 border-r border-[#d7e3ec] bg-white/95 shadow-[8px_0_30px_rgba(0,59,92,0.06)] lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-80 lg:flex-col">
          <div className="bg-navy px-6 py-7">
            <Link className="inline-flex items-center" href="/">
              <BrandLogo />
            </Link>
          </div>

          <nav className="flex-1 space-y-2 p-5">
            {modules.map((module) => {
              const Icon = module.icon;

              return (
                <Link
                  className="group flex items-center gap-3 rounded-xl border border-transparent px-3 py-3 text-sm font-semibold text-slate-700 transition hover:border-[#d7e3ec] hover:bg-[#f5f9fb] hover:text-navy hover:shadow-[0_8px_20px_rgba(0,59,92,0.05)]"
                  href={module.href}
                  key={module.href}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#d7e3ec] bg-[#eef8fb] text-sea transition group-hover:border-sea group-hover:bg-white">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block leading-5">{module.label}</span>
                    <span className="block truncate text-xs font-medium text-slate-500">
                      {module.helper}
                    </span>
                  </span>
                  <span className="h-8 w-1 rounded-full bg-transparent transition group-hover:bg-clay" />
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-[#d7e3ec] bg-[#fbfdfe] p-5">
            <Link
              className="flex items-center gap-3 rounded-xl bg-navy px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(0,59,92,0.16)] transition hover:bg-[#075077]"
              href="/admin"
            >
              <PlusCircle className="h-5 w-5 text-clay" />
              <span className="flex-1">Cargar datos</span>
            </Link>
            <div className="mt-3 flex items-center gap-3 rounded-xl border border-[#d7e3ec] bg-white px-3 py-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#eef8fb] text-sea">
                <Settings className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-navy">MVP interno</p>
                <p className="text-xs text-slate-500">Sin autenticación</p>
              </div>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="border-b border-[#d7e3ec] bg-navy px-4 py-3 lg:hidden">
            <Link className="inline-flex items-center" href="/">
              <BrandLogo compact />
            </Link>
            <nav className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {modules.map((module) => (
                <Link
                  className="whitespace-nowrap rounded-lg border border-line bg-mist px-3 py-2 text-sm font-semibold text-slate-700"
                  href={module.href}
                  key={module.href}
                >
                  {module.label}
                </Link>
              ))}
              <Link
                className="whitespace-nowrap rounded-lg border border-navy bg-navy px-3 py-2 text-sm font-semibold text-white"
                href="/admin"
              >
                Cargar datos
              </Link>
            </nav>
          </div>

          <div className="mx-auto w-full max-w-7xl px-4 py-7 sm:px-6 lg:px-8">
            <header className="rounded-2xl border border-[#d7e3ec] bg-white px-5 py-6 shadow-[0_14px_40px_rgba(0,59,92,0.06)]">
              <div className="max-w-3xl">
                <p className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-sea">
                  {eyebrow}
                </p>
                <h1 className="text-3xl font-black leading-tight tracking-tight text-navy sm:text-4xl">
                  {title}
                </h1>
                <p className="mt-3 max-w-2xl text-base leading-7 text-slate-700">
                  {description}
                </p>
              </div>
            </header>

            {children}
          </div>
        </div>
      </div>
    </main>
  );
}

export function Panel({
  children,
  count,
  title,
}: {
  children: React.ReactNode;
  count?: string;
  title: string;
}) {
  return (
    <section className="mt-5 rounded-2xl border border-[#d7e3ec] bg-white p-5 shadow-[0_14px_40px_rgba(0,59,92,0.06)]">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <h2 className="text-xl font-black tracking-tight text-navy">{title}</h2>
        {count ? (
          <span className="rounded-full border border-[#d7e3ec] bg-[#f5f9fb] px-3 py-1 text-sm font-semibold text-slate-600">
            {count}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex min-w-16 justify-center rounded px-2 py-1 text-xs font-semibold ${
        active ? "bg-[#ffe6ca] text-[#86510d]" : "bg-[#e4f4ea] text-[#24613d]"
      }`}
    >
      {active ? "Si" : "No"}
    </span>
  );
}
