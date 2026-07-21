type RecoveryLoadingCardProps = {
  label: string;
  steps?: string[];
};

const defaultSteps = [
  "Cargando seguimiento...",
  "Preparando graficos...",
  "Cargando auditoria...",
  "Finalizando vista...",
];

export function RecoveryLoadingCard({ label, steps = defaultSteps }: RecoveryLoadingCardProps) {
  return (
    <section className="mt-5 overflow-hidden rounded-xl border border-[#d6e1ea] bg-white shadow-[0_8px_22px_rgba(2,53,116,0.04)]">
      <style>{`
        @keyframes recoveryProgressGuide {
          0% { width: 18%; }
          35% { width: 52%; }
          70% { width: 82%; }
          100% { width: 92%; }
        }
        @keyframes recoveryStepPulse {
          0%, 100% { opacity: .45; transform: translateY(0); }
          35% { opacity: 1; transform: translateY(-1px); }
        }
      `}</style>
      <div className="flex min-h-[220px] items-center justify-center px-5 py-8">
        <div className="w-full max-w-xl rounded-2xl border border-[#edf2f6] bg-[#fbfdfe] px-6 py-5 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="relative mt-1 h-11 w-11 shrink-0">
              <div className="absolute inset-0 rounded-full border-2 border-[#d6e1ea]" />
              <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-sea" />
              <div className="absolute inset-3 rounded-full bg-sea/10" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-navy">Preparando datos</p>
              <p className="mt-1 text-sm text-slate-600">{label}</p>
              <p className="mt-1 text-xs text-slate-500">
                Esto puede tardar unos segundos si hay muchos datos recientes.
              </p>
            </div>
          </div>

          <div className="mt-5 h-2 overflow-hidden rounded-full bg-white ring-1 ring-[#edf2f6]">
            <div
              className="h-full rounded-full bg-sea"
              style={{ animation: "recoveryProgressGuide 2.8s ease-in-out infinite alternate" }}
            />
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {steps.map((step, index) => (
              <div
                className="flex items-center gap-2 rounded-lg border border-[#edf2f6] bg-white px-3 py-2 text-xs text-slate-600"
                key={step}
                style={{ animation: "recoveryStepPulse 2.4s ease-in-out infinite", animationDelay: `${index * 0.32}s` }}
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sea" />
                <span>{step}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}