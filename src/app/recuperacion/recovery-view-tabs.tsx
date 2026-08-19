"use client";

import { useRouter } from "next/navigation";

export type RecoveryView = "carritos" | "conversaciones";

type RecoveryViewTabsProps = {
  activeView: RecoveryView;
};

const tabs: Array<{ label: string; value: RecoveryView }> = [
  { label: "Carritos perdidos", value: "carritos" },
  { label: "Conversaciones", value: "conversaciones" },
];

export function RecoveryViewTabs({ activeView }: RecoveryViewTabsProps) {
  const router = useRouter();

  function changeView(view: RecoveryView) {
    const href = view === "carritos" ? "/recuperacion" : "/recuperacion?view=conversaciones";
    router.replace(href, { scroll: false });
  }

  return (
    <div className="mt-5 flex flex-wrap items-center gap-2" role="tablist" aria-label="Vista de recuperacion">
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
