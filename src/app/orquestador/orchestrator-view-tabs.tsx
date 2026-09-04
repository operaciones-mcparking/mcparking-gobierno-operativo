"use client";

import { useRouter } from "next/navigation";

export type OrchestratorView = "dashboard" | "customer-window" | "control";

type OrchestratorViewTabsProps = {
  activeView: OrchestratorView;
};

const tabs: Array<{ label: string; value: OrchestratorView }> = [
  { label: "Dashboard", value: "dashboard" },
  { label: "Customer Window", value: "customer-window" },
  { label: "Centro de Control", value: "control" },
];

export function OrchestratorViewTabs({ activeView }: OrchestratorViewTabsProps) {
  const router = useRouter();

  function changeView(view: OrchestratorView) {
    router.replace(`/orquestador?view=${view}`, { scroll: false });
  }

  return (
    <div className="mt-5 flex flex-wrap items-center gap-2" role="tablist" aria-label="Vista del orquestador">
      {tabs.map((tab) => {
        const isActive = activeView === tab.value;

        return (
          <button
            aria-selected={isActive}
            className={`rounded-lg border px-4 py-2 text-sm font-semibold transition ${
              isActive
                ? "border-navy bg-navy text-white"
                : "border-[#cbd8e3] bg-white text-navy hover:border-sea"
            }`}
            key={tab.value}
            onClick={() => changeView(tab.value)}
            role="tab"
            type="button"
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
