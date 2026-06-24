"use client";

import { useState } from "react";

export function ConfirmSubmitButton({
  children,
  className,
  message,
  pendingLabel = "Procesando...",
  title = "Confirmar accion",
}: {
  children: React.ReactNode;
  className: string;
  message: string;
  pendingLabel?: string;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState(false);
  const [formElement, setFormElement] = useState<HTMLFormElement | null>(null);

  return (
    <>
      <button
        className={className}
        disabled={pendingSubmit}
        onClick={(event) => {
          if (!pendingSubmit) {
            event.preventDefault();
            setFormElement(event.currentTarget.form);
            setOpen(true);
          }
        }}
        type="submit"
      >
        {pendingSubmit ? pendingLabel : children}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#132333]/45 px-4">
          <div className="w-full max-w-md rounded-2xl border border-[#cbd8e3] bg-white p-5 shadow-[0_24px_60px_rgba(2,53,116,0.25)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-[#25677a]">
                  Confirmacion
                </p>
                <h2 className="mt-2 text-lg font-medium text-[#023574]">{title}</h2>
              </div>
              <button
                aria-label="Cerrar confirmacion"
                className="rounded-lg border border-[#cbd8e3] px-2 py-1 text-sm text-slate-500 transition hover:bg-[#f6f8fa]"
                onClick={() => setOpen(false)}
                type="button"
              >
                x
              </button>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-700">{message}</p>
            {pendingSubmit ? (
              <div className="mt-4 rounded-xl border border-[#c9d8e4] bg-[#eef4f8] px-4 py-3 text-sm font-medium text-[#023574]">
                Procesando la solicitud. Esto puede tardar unos segundos.
              </div>
            ) : null}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                className="rounded-lg border border-[#cbd8e3] bg-white px-4 py-2 text-sm font-medium text-[#023574] transition hover:bg-[#f6f8fa]"
                disabled={pendingSubmit}
                onClick={() => setOpen(false)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className={className}
                onClick={() => {
                  setPendingSubmit(true);
                  window.setTimeout(() => {
                    formElement?.requestSubmit();
                  }, 0);
                }}
                disabled={pendingSubmit}
                type="button"
              >
                {pendingSubmit ? pendingLabel : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
