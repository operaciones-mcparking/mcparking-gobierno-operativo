import Image from "next/image";

import { signIn, signInWithGoogle } from "@/app/login/actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const errorMessage =
    params.error === "missing"
      ? "Ingresa correo y clave para continuar."
      : params.error === "invalid"
        ? "No pudimos iniciar sesion. Revisa el correo o la clave."
        : params.error === "google"
          ? "No pudimos conectar con Google. Intenta nuevamente."
          : params.error === "not_allowed"
            ? "Tu correo no esta autorizado para entrar. Pide acceso a un administrador."
        : null;

  return (
    <main className="flex min-h-screen bg-[#f4f7fa] text-ink">
      <section className="relative hidden min-h-screen w-[42%] overflow-hidden bg-navy p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden="true" className="absolute inset-0 opacity-50">
          <div className="absolute -left-28 top-28 h-72 w-72 rounded-full border border-[#17a2b8]/25" />
          <div className="absolute bottom-20 right-[-120px] h-96 w-96 rounded-full border border-[#8ed8e5]/20" />
          <div className="absolute left-24 top-1/2 h-px w-72 rotate-[-24deg] bg-gradient-to-r from-transparent via-[#8ed8e5]/35 to-transparent" />
          <div className="absolute bottom-40 left-16 size-2 rounded-full bg-[#ffc107] shadow-[0_0_0_8px_rgba(255,193,7,0.12)]" />
          <div className="absolute right-24 top-32 size-2 rounded-full bg-[#8ed8e5] shadow-[0_0_0_8px_rgba(142,216,229,0.12)]" />
        </div>

        <div className="relative">
          <Image
            alt="McParking"
            className="h-16 w-auto"
            height={64}
            priority
            src="/mcparking-logo.svg"
            width={245}
          />
        </div>

        <div className="relative max-w-md">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-[#8ed8e5]">
            Gobierno operativo
          </p>
          <h2 className="mt-4 text-3xl font-medium leading-tight">
            Pais, sede, empresa y roles en una sola linea operacional.
          </h2>
          <p className="mt-4 text-sm leading-6 text-[#c8d9e8]">
            Acceso privado para trabajar con la estructura autorizada de McParking.
          </p>
        </div>

        <p className="relative text-xs text-[#c8d9e8]">McParking interno</p>
      </section>

      <section className="relative flex flex-1 items-center justify-center overflow-hidden px-5 py-10">
        <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
          <div className="login-network login-network-a" />
          <div className="login-network login-network-b" />
          <div className="login-network-line login-network-line-a" />
          <div className="login-network-line login-network-line-b" />
          <div className="login-network-line login-network-line-c" />
          <div className="login-network-node login-network-node-a" />
          <div className="login-network-node login-network-node-b" />
          <div className="login-network-node login-network-node-c" />
          <div className="login-network-node login-network-node-d" />
        </div>

      <div className="relative z-10 w-full max-w-[440px]">
        <div className="mb-8 text-center">
          <div className="mx-auto flex w-fit rounded-xl bg-navy px-5 py-3 shadow-[0_14px_34px_rgba(2,53,116,0.16)] lg:hidden">
            <Image
              alt="McParking"
              className="h-10 w-auto"
              height={64}
              priority
              src="/mcparking-logo.svg"
              width={245}
            />
          </div>
          <p className="mt-5 text-[11px] font-medium uppercase tracking-[0.18em] text-sea">
            Acceso interno
          </p>
          <h1 className="mt-2 text-[2rem] font-medium leading-tight text-navy">
            Iniciar sesion
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Entra para trabajar sobre la linea operacional asignada.
          </p>
        </div>

        {errorMessage ? (
          <div className="mb-4 rounded-xl border border-[#ffd4a3] bg-[#fff4e5] px-4 py-3 text-sm font-medium text-[#8a4a00]">
            {errorMessage}
          </div>
        ) : null}

        <form action={signInWithGoogle}>
          <input name="next" type="hidden" value={params.next ?? "/estructura"} />
          <button
            className="flex h-11 w-full items-center justify-center gap-3 rounded-lg border border-[#ccd9e5] bg-white px-4 text-sm font-medium text-navy shadow-sm transition hover:border-sea hover:bg-[#fbfdff]"
            type="submit"
          >
            <svg
              aria-hidden="true"
              className="size-[18px]"
              viewBox="0 0 18 18"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
                fill="#4285F4"
              />
              <path
                d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.33-1.58-5.04-3.71H.94v2.33A9 9 0 0 0 9 18Z"
                fill="#34A853"
              />
              <path
                d="M3.96 10.71A5.41 5.41 0 0 1 3.68 9c0-.59.1-1.16.28-1.71V4.96H.94A9 9 0 0 0 0 9c0 1.45.35 2.82.94 4.04l3.02-2.33Z"
                fill="#FBBC05"
              />
              <path
                d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .94 4.96l3.02 2.33C4.67 5.16 6.66 3.58 9 3.58Z"
                fill="#EA4335"
              />
            </svg>
            Entrar con Google
          </button>
        </form>

        <div className="my-7 flex items-center gap-4">
          <div className="h-px flex-1 bg-line" />
          <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
            o
          </span>
          <div className="h-px flex-1 bg-line" />
        </div>

        <form action={signIn} className="space-y-4">
          <input name="next" type="hidden" value={params.next ?? "/estructura"} />

          <label className="block text-sm font-medium text-navy">
            Correo
            <input
              autoComplete="email"
              className="mt-2 h-11 w-full rounded-lg border border-[#ccd9e5] bg-white px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-sea focus:ring-2 focus:ring-[#dceff5]"
              name="email"
              placeholder="tu@mcparking.cl"
              type="email"
            />
          </label>

          <label className="block text-sm font-medium text-navy">
            Clave
            <input
              autoComplete="current-password"
              className="mt-2 h-11 w-full rounded-lg border border-[#ccd9e5] bg-white px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-sea focus:ring-2 focus:ring-[#dceff5]"
              name="password"
              placeholder="Ingresa tu clave"
              type="password"
            />
          </label>

          <button
            className="mt-2 h-11 w-full rounded-lg bg-navy px-4 text-sm font-medium text-white shadow-sm transition hover:bg-[#034982]"
            type="submit"
          >
            Entrar
          </button>
        </form>

        <p className="mt-6 text-center text-xs leading-5 text-slate-500">
          Acceso privado. Las cuentas y permisos los administra McParking.
        </p>
      </div>
      </section>
    </main>
  );
}
