"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export function PasswordInput() {
  const [passwordVisible, setPasswordVisible] = useState(false);

  return (
    <label className="block text-sm font-medium text-navy">
      Clave
      <div className="relative mt-2">
        <input
          autoComplete="current-password"
          className="h-11 w-full rounded-lg border border-[#ccd9e5] bg-white px-3 pr-12 text-sm outline-none transition placeholder:text-slate-400 focus:border-sea focus:ring-2 focus:ring-[#dceff5]"
          name="password"
          placeholder="Ingresa tu clave"
          type={passwordVisible ? "text" : "password"}
        />
        <button
          aria-label={passwordVisible ? "Ocultar contraseña" : "Mostrar contraseña"}
          className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center rounded-r-lg text-slate-500 transition hover:text-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sea"
          onClick={() => setPasswordVisible((visible) => !visible)}
          onMouseDown={(event) => event.preventDefault()}
          type="button"
        >
          {passwordVisible ? <EyeOff aria-hidden="true" className="h-5 w-5" /> : <Eye aria-hidden="true" className="h-5 w-5" />}
        </button>
      </div>
    </label>
  );
}
