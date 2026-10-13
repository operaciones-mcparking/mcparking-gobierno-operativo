import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const homePage = readFileSync("src/app/page.tsx", "utf8");
const middleware = readFileSync("src/middleware.ts", "utf8");
const loginPage = readFileSync("src/app/login/page.tsx", "utf8");
const loginActions = readFileSync("src/app/login/actions.ts", "utf8");
const authCallback = readFileSync("src/app/auth/callback/route.ts", "utf8");

test("root route redirects authenticated users to orquestador", () => {
  assert.match(homePage, /redirect\(nextQuery \? `\/orquestador\?\$\{nextQuery\}` : "\/orquestador"\)/);
  assert.doesNotMatch(homePage, /redirect\(nextQuery \? `\/estructura\?\$\{nextQuery\}` : "\/estructura"\)/);
});

test("root route keeps existing login flow for anonymous users", () => {
  assert.match(middleware, /login\.searchParams\.set\("next", `\$\{pathname\}\$\{request\.nextUrl\.search\}`\)/);
  assert.match(loginActions, /const safeNext = next\.startsWith\("\/"\) \? next : "\/"/);
  assert.match(authCallback, /return NextResponse\.redirect\(new URL\(next, requestUrl\.origin\)\)/);
});

test("structure route remains protected without making root a structure page", () => {
  assert.match(middleware, /if \(pathname === "\/estructura"\) requiredPermission = "structure\.view"/);
  assert.doesNotMatch(middleware, /pathname === "\/" \|\| pathname === "\/estructura"/);
});

test("login defaults remain unchanged for direct login visits", () => {
  assert.match(loginPage, /value=\{params\.next \?\? "\/estructura"\}/);
  assert.match(loginActions, /String\(formData\.get\("next"\) \?\? "\/estructura"\)/);
  assert.match(authCallback, /return "\/estructura"/);
});
