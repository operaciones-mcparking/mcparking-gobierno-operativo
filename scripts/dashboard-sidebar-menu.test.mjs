import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const shell = readFileSync("src/components/dashboard/shell.tsx", "utf8");
const mobileNavigation = readFileSync("src/components/dashboard/mobile-navigation.tsx", "utf8");

function position(value) {
  const index = shell.indexOf(value);
  assert.notEqual(index, -1, `${value} must be present`);

  return index;
}

test("sidebar exposes only the three requested navigation items in order", () => {
  const operations = position('label: "Operaciones"');
  const recovery = position('label: "Carritos perdidos"');
  const structure = position('label: "Estructura"');

  assert.ok(operations < recovery);
  assert.ok(recovery < structure);
  assert.match(shell, /href: "\/orquestador"[\s\S]*label: "Operaciones"[\s\S]*helper: "Dashboard y monitoreo"/);
  assert.match(shell, /href: "\/recuperacion"[\s\S]*label: "Carritos perdidos"[\s\S]*helper: "Recuperaci.n WhatsApp"/);
  assert.match(shell, /href: "\/estructura"[\s\S]*label: "Estructura"[\s\S]*helper: "Gobierno operativo"/);
  assert.doesNotMatch(shell, /label: "Empresas"|label: "Sistemas"|label: "Brechas"/);
});

test("sidebar group headers are not rendered for the simplified menu", () => {
  assert.match(shell, /label: ""/);
  assert.doesNotMatch(shell, />\s*ESTRUCTURA\s*</);
  assert.doesNotMatch(shell, />\s*OPERACI.N\s*</);
  assert.doesNotMatch(shell, />\s*CONTROL\s*</);
  assert.match(shell, /\{group\.label \? \(/);
  assert.match(mobileNavigation, /\{group\.label \? \(/);
});

test("hidden sidebar pages still exist", () => {
  assert.equal(existsSync("src/app/empresas/page.tsx"), true);
  assert.equal(existsSync("src/app/sistemas/page.tsx"), true);
  assert.equal(existsSync("src/app/brechas/page.tsx"), true);
});
