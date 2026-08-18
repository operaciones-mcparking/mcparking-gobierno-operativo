import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("src/app/login/page.tsx", "utf8");
const passwordInput = readFileSync("src/app/login/password-input.tsx", "utf8");

test("login password is hidden by default and can be toggled without changing authentication", () => {
  assert.ok(passwordInput.includes("useState(false)"));
  assert.ok(passwordInput.includes('type={passwordVisible ? "text" : "password"}'));
  assert.ok(passwordInput.includes('name="password"'));
  assert.ok(passwordInput.includes('autoComplete="current-password"'));
  assert.ok(passwordInput.includes("setPasswordVisible((visible) => !visible)"));
  assert.doesNotMatch(passwordInput, /localStorage|sessionStorage|console./);
  assert.ok(page.includes("<form action={signIn}"));
  assert.ok(page.includes("<PasswordInput />"));
});

test("password toggle is keyboard and mobile accessible without submitting the form", () => {
  assert.ok(passwordInput.includes('type="button"'));
  assert.ok(passwordInput.includes('aria-label={passwordVisible ? "Ocultar contraseña" : "Mostrar contraseña"}'));
  assert.ok(passwordInput.includes("onMouseDown={(event) => event.preventDefault()}"));
  assert.ok(passwordInput.includes("w-11"));
  assert.ok(passwordInput.includes("EyeOff"));
  assert.ok(passwordInput.includes("Eye"));
  assert.ok(page.includes('type="submit"'));
  assert.ok(page.includes("Entrar"));
});
test("login uses neutral copy without describing the platform", () => {
  assert.ok(page.includes("PORTAL INTERNO"));
  assert.ok(page.includes("Bienvenido."));
  assert.ok(page.includes("Acceso privado para usuarios autorizados."));
  assert.ok(page.includes("Acceso restringido."));
  assert.ok(!page.includes("Gobierno operativo"));
  assert.ok(!page.includes("Pais, sede, empresa y roles"));
  assert.ok(!page.includes("linea operacional"));
  assert.ok(!page.includes("estructura autorizada de McParking"));
  assert.ok(!page.includes("McParking interno"));
  assert.ok(!page.includes("Las cuentas y permisos los administra McParking"));
});