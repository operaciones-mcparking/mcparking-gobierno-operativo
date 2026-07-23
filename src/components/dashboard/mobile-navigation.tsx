"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Building2,
  Database,
  GitBranch,
  LogOut,
  Menu,
  MessageCircle,
  Network,
  PlusCircle,
  Settings,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

import { signOut } from "@/app/auth/actions";

export type MobileNavigationIcon =
  | "alert-triangle"
  | "building"
  | "database"
  | "git-branch"
  | "message-circle"
  | "network"
  | "users";

export type MobileNavigationItem = {
  helper: string;
  href: string;
  iconKey: MobileNavigationIcon;
  label: string;
};

export type MobileNavigationGroup = {
  items: MobileNavigationItem[];
  label: string;
};

const iconByKey: Record<MobileNavigationIcon, LucideIcon> = {
  "alert-triangle": AlertTriangle,
  building: Building2,
  database: Database,
  "git-branch": GitBranch,
  "message-circle": MessageCircle,
  network: Network,
  users: Users,
};

export function MobileDashboardNavigation({
  activePath,
  groups,
  isAdmin,
  userLabel,
}: {
  activePath?: string;
  groups: MobileNavigationGroup[];
  isAdmin: boolean;
  userLabel: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  function closeMenu() {
    setIsOpen(false);
  }

  return (
    <>
      <button
        aria-expanded={isOpen}
        aria-label="Abrir menu principal"
        className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-white transition hover:bg-white/10 active:bg-white/15 focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 focus:ring-offset-navy"
        onClick={() => setIsOpen(true)}
        type="button"
      >
        <Menu className="h-6 w-6" />
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Cerrar menu principal"
            className="absolute inset-0 h-full w-full bg-navy/55 backdrop-blur-[1px]"
            onClick={closeMenu}
            type="button"
          />
          <aside className="absolute right-0 top-0 flex h-[100dvh] w-[min(88vw,360px)] flex-col overflow-hidden border-l border-[#cbd8e3] bg-white shadow-2xl">
            <div className="flex shrink-0 justify-end border-b border-[#cbd8e3] bg-white px-4 py-3">
              <button
                aria-label="Cerrar menu principal"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#cbd8e3] bg-white text-slate-600 transition hover:border-[#9bcbdc] hover:bg-[#f6f8fa] hover:text-navy focus:outline-none focus:ring-2 focus:ring-clay"
                onClick={closeMenu}
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
              {groups.map((group) => (
                <div key={group.label}>
                  <p className="mb-2 px-3 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-400">
                    {group.label}
                  </p>
                  <div className="space-y-1">
                    {group.items.map((item) => {
                      const Icon = iconByKey[item.iconKey];
                      const isActive = activePath === item.href;

                      return (
                        <Link
                          aria-current={isActive ? "page" : undefined}
                          className={`group flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                            isActive
                              ? "border-sea bg-[#eef7f8] text-navy"
                              : "border-transparent text-slate-700 hover:border-[#cbd8e3] hover:bg-[#f6f8fa] hover:text-navy"
                          }`}
                          href={item.href}
                          key={item.href}
                          onClick={closeMenu}
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#cbd8e3] bg-[#eef4f8] text-sea transition group-hover:border-sea group-hover:bg-white">
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block leading-5">{item.label}</span>
                            <span className="block truncate text-xs font-normal text-slate-500">
                              {item.helper}
                            </span>
                          </span>
                          <span className={`h-8 w-1 rounded-full transition ${isActive ? "bg-clay" : "bg-transparent group-hover:bg-clay"}`} />
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>

            <div className="shrink-0 border-t border-[#cbd8e3] bg-[#fbfdfe] p-5">
              {isAdmin ? (
                <Link
                  className="flex items-center gap-3 rounded-xl bg-navy px-4 py-3 text-sm font-medium text-white shadow-[0_10px_22px_rgba(2,53,116,0.16)] transition hover:bg-[#034982]"
                  href="/admin"
                  onClick={closeMenu}
                >
                  <PlusCircle className="h-5 w-5 text-clay" />
                  <span className="flex-1">Administracion</span>
                </Link>
              ) : null}
              <div className="mt-3 flex items-center gap-3 rounded-xl border border-[#cbd8e3] bg-white px-3 py-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#eef4f8] text-sea">
                  <Settings className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-navy">MVP interno</p>
                  <p className="truncate text-xs text-slate-500">{userLabel}</p>
                </div>
              </div>
              <form action={signOut}>
                <button
                  className="mt-3 flex w-full items-center gap-3 rounded-xl border border-[#cbd8e3] bg-white px-4 py-3 text-left text-sm font-medium text-slate-700 transition hover:border-[#9bcbdc] hover:text-navy"
                  type="submit"
                >
                  <LogOut className="h-4 w-4 text-sea" />
                  Cerrar sesion
                </button>
              </form>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
