"use client";

import { PlusCircle, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createPersonFromStructure } from "@/app/admin/actions";

const inputClass =
  "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none transition focus:border-sea focus:ring-2 focus:ring-[#e6edf3]";

function Field({
  children,
  label,
  required = false,
}: {
  children: ReactNode;
  label: string;
  required?: boolean;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-slate-700">
      <span>
        {label}
        {required ? <span className="text-[#b42318]"> *</span> : null}
      </span>
      {children}
    </label>
  );
}

export function CreatePersonModal({
  canCreate = true,
}: {
  canCreate?: boolean;
  returnTo: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!notice) return;

    const timeout = window.setTimeout(() => setNotice(null), 3200);

    return () => window.clearTimeout(timeout);
  }, [notice]);

  function closeModal() {
    if (isPending) return;
    setError(null);
    setOpen(false);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    setError(null);
    setNotice(null);

    startTransition(async () => {
      const result = await createPersonFromStructure(formData);

      if (!result.ok) {
        setError(result.error || "No se pudo crear la persona.");
        return;
      }

      formRef.current?.reset();
      setOpen(false);
      setNotice("Persona creada");
      router.refresh();
    });
  }

  if (!canCreate) {
    return null;
  }

  return (
    <>
      <button
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white transition hover:bg-[#01295b]"
        onClick={() => setOpen(true)}
        type="button"
      >
        <PlusCircle className="h-4 w-4" />
        Nueva persona
      </button>

      {notice ? (
        <span className="fixed right-5 top-5 z-[60] inline-flex items-center rounded-lg border border-[#c9ead7] bg-[#f0fbf4] px-3 py-2 text-sm font-medium text-[#167344] shadow-[0_16px_32px_rgba(2,53,116,0.14)]">
          {notice}
        </span>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
          <button
            aria-label="Cerrar formulario"
            className="absolute inset-0 bg-navy/45 backdrop-blur-[1px]"
            onClick={closeModal}
            type="button"
          />
          <section
            aria-labelledby="create-person-title"
            aria-modal="true"
            className="relative z-10 w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-[0_24px_80px_rgba(2,53,116,0.28)]"
            role="dialog"
          >
            <header className="flex items-start justify-between gap-4 border-b border-line bg-white px-5 py-4">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-sea">
                  Nueva persona
                </p>
                <h3 className="mt-1 text-xl font-medium text-navy" id="create-person-title">
                  Crear persona interna
                </h3>
                <p className="mt-1 text-sm leading-5 text-slate-600">
                  Crea una persona para el modelo operativo. Esto no habilita acceso de login.
                </p>
              </div>
              <button
                aria-label="Cerrar"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line text-slate-600 transition hover:bg-[#f8fafb]"
                disabled={isPending}
                onClick={closeModal}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <form className="grid gap-4 bg-[#f8fafb] p-5" onSubmit={handleSubmit} ref={formRef}>
              <div className="rounded-xl border border-line bg-white p-4">
                <div className="grid gap-3">
                  <Field label="Nombre" required>
                    <input
                      className={inputClass}
                      name="name"
                      placeholder="Ej: Agustin Zilleruelo"
                      required
                    />
                  </Field>
                  <Field label="Email">
                    <input
                      className={inputClass}
                      name="email"
                      placeholder="persona@mcparking.cl"
                      type="email"
                    />
                  </Field>
                  <Field label="Telefono">
                    <input className={inputClass} name="phone" placeholder="+56 9 1234 5678" />
                  </Field>
                </div>
              </div>

              {error ? (
                <p className="rounded-lg border border-[#ffd6b0] bg-[#fff7ed] px-3 py-2 text-sm text-[#9a4a16]">
                  {error}
                </p>
              ) : null}

              <div className="flex flex-wrap justify-end gap-2 rounded-xl border border-line bg-white p-4">
                <button
                  className="inline-flex items-center justify-center rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-[#f8fafb]"
                  disabled={isPending}
                  onClick={closeModal}
                  type="button"
                >
                  Cancelar
                </button>
                <button
                  className="inline-flex items-center justify-center rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white transition hover:bg-[#01295b] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isPending}
                  type="submit"
                >
                  {isPending ? "Creando..." : "Crear persona"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
