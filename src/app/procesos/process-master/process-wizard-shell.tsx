'use client';

import { ArrowLeft, ArrowRight, Check, Save } from 'lucide-react';
import { useEffect, useLayoutEffect, useState } from 'react';

import {
  useProcessMasterDirtySections,
  useProcessMasterSaveState,
  useProcessMasterWizardPosition,
} from './process-master-save-coordinator';

export type ProcessWizardStep = {
  content: React.ReactNode;
  id: string;
  label: string;
};

type NavigationRequest = {
  currentStep: number;
  nextStep: number;
};

type Props = {
  initialStep?: number;
  mode: 'create' | 'edit';
  onBeforeNavigate?: (request: NavigationRequest) => boolean | Promise<boolean>;
  pending?: boolean;
  pendingNextLabel?: string;
  restoreScrollKey?: string;
  steps: ProcessWizardStep[];
};

function clampStep(step: number, total: number) {
  return Math.min(Math.max(Math.trunc(step) || 1, 1), total);
}

export function ProcessWizardShell({
  initialStep = 1,
  mode,
  onBeforeNavigate,
  pending = false,
  pendingNextLabel = 'Avanzando...',
  restoreScrollKey,
  steps,
}: Props) {
  const firstStep = clampStep(initialStep, steps.length);
  const [activeStep, setActiveStep] = useState(firstStep);
  const [maxVisitedStep, setMaxVisitedStep] = useState(firstStep);
  const [isNavigating, setIsNavigating] = useState(false);
  const dirtySections = useProcessMasterDirtySections();
  const saveState = useProcessMasterSaveState();
  const setWizardPosition = useProcessMasterWizardPosition();

  useLayoutEffect(() => {
    setWizardPosition?.(activeStep, steps.length);
  }, [activeStep, setWizardPosition, steps.length]);

  useEffect(() => {
    if (!restoreScrollKey) return;
    const storedScroll = sessionStorage.getItem(restoreScrollKey);
    if (!storedScroll) return;
    sessionStorage.removeItem(restoreScrollKey);
    const scrollY = Number(storedScroll);
    if (!Number.isFinite(scrollY)) return;
    const frame = requestAnimationFrame(() => window.scrollTo({ left: window.scrollX, top: scrollY }));
    return () => cancelAnimationFrame(frame);
  }, [restoreScrollKey]);

  async function navigateTo(nextStep: number, source: 'direct' | 'sequential') {
    const target = clampStep(nextStep, steps.length);
    if (target === activeStep || isNavigating || pending) return;
    if (mode === 'create' && source === 'direct' && target > maxVisitedStep) return;

    setIsNavigating(true);
    try {
      const allowed = await onBeforeNavigate?.({ currentStep: activeStep, nextStep: target });
      if (allowed === false) return;
      setActiveStep(target);
      setMaxVisitedStep((current) => Math.max(current, target));
    } finally {
      setIsNavigating(false);
    }
  }

  const activeIndex = activeStep - 1;
  const waiting = pending || isNavigating;

  return (
    <div className="mt-5 grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start">
      <nav aria-label="Pasos de la ficha de proceso" className="overflow-x-auto rounded-lg border border-[#dbe4eb] bg-white p-2 lg:sticky lg:top-24 lg:overflow-visible lg:p-3">
        <ol className="flex min-w-max gap-2 lg:min-w-0 lg:flex-col">
          {steps.map((step, index) => {
            const number = index + 1;
            const isActive = number === activeStep;
            const isLocked = mode === 'create' && number > maxVisitedStep;
            const isDirty = dirtySections.has(step.id);
            return (
              <li key={step.id}>
                <button
                  aria-current={isActive ? 'step' : undefined}
                  aria-label={`${number}. ${step.label}${isLocked ? ', bloqueado' : ''}`}
                  className={`group flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sea ${isActive ? 'bg-navy text-white' : isLocked ? 'cursor-not-allowed text-slate-400' : 'text-navy hover:bg-[#eef4f8]'}`}
                  disabled={isLocked || waiting}
                  onClick={() => void navigateTo(number, 'direct')}
                  type="button"
                >
                  <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${isActive ? 'border-clay bg-clay text-navy' : 'border-[#cbd8e3] bg-white text-navy'}`}>{number}</span>
                  <span className="max-w-40 whitespace-normal leading-4 lg:max-w-none">{step.label}</span>
                  {isDirty ? <span aria-label="Cambios sin guardar" className="ml-auto h-2 w-2 shrink-0 rounded-full bg-clay" title="Cambios sin guardar" /> : null}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="min-w-0">
        <div>
          {steps.map((step, index) => (
            <div aria-hidden={index !== activeIndex} className={index === activeIndex ? 'block' : 'hidden'} key={step.id}>
              {step.content}
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-col-reverse gap-2 rounded-lg border border-[#dbe4eb] bg-[#fbfcfd] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            className="inline-flex items-center justify-center gap-2 rounded-md border border-line bg-white px-4 py-2 text-sm font-bold text-navy transition hover:border-sea hover:bg-[#eef4f8] disabled:cursor-not-allowed disabled:opacity-40"
            disabled={activeStep === 1 || waiting}
            onClick={() => void navigateTo(activeStep - 1, 'sequential')}
            type="button"
          >
            <ArrowLeft className="h-4 w-4" />
            Anterior
          </button>
          {activeStep < steps.length ? (
            <button
              className="inline-flex items-center justify-center gap-2 rounded-md bg-navy px-4 py-2 text-sm font-bold text-white transition hover:bg-[#075077] disabled:cursor-wait disabled:opacity-60"
              disabled={waiting}
              onClick={() => void navigateTo(activeStep + 1, 'sequential')}
              type="button"
            >
              {waiting ? pendingNextLabel : 'Siguiente'}
              <ArrowRight className="h-4 w-4 text-clay" />
            </button>
          ) : saveState ? (
            <button
              className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sea ${saveState.hasChanges ? 'bg-navy text-white hover:bg-[#075077]' : 'cursor-not-allowed border border-[#d6e1ea] bg-[#f4f7f9] text-slate-400'}`}
              disabled={!saveState.hasChanges || saveState.isSaving}
              onClick={() => void saveState.saveFicha()}
              type="button"
            >
              {saveState.feedback === '\u2713 Ficha guardada' && !saveState.hasChanges ? (
                <Check className="h-4 w-4 text-[#247a4b]" />
              ) : (
                <Save className={`h-4 w-4 ${saveState.hasChanges ? 'text-clay' : 'text-slate-400'}`} />
              )}
              {saveState.isSaving
                ? 'Guardando ficha...'
                : saveState.feedback === '\u2713 Ficha guardada' && !saveState.hasChanges
                  ? '\u2713 Ficha guardada'
                  : 'Guardar ficha'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}