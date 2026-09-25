import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync("src/lib/customer-window/identity-decision-preview.ts", "utf8");
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const previewModule = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);

function detailFixture({
  bookingCount = 2,
  candidateCount = 0,
  conflictCount = bookingCount,
  contradictory = false,
  profileCount = 1,
  profileStatus = "active",
} = {}) {
  const profiles = Array.from({ length: profileCount }, (_, index) => ({
    bookingCount: Math.max(1, Math.floor(bookingCount / profileCount)),
    firstBookingAt: "2026-09-01T00:00:00Z",
    lastBookingAt: "2026-09-02T00:00:00Z",
    mergedIntoProfileId: profileStatus === "merged" ? "canonical-profile" : null,
    profileId: `profile-${index + 1}`,
    resolverVersions: ["customer_identity_v1"],
    status: profileStatus,
  }));
  return {
    events: contradictory ? [{ evidence: { contradictorySignals: true }, reason: "contradictory_phone_email" }] : [{ evidence: { matchedByEmail: true }, reason: "requires_review" }],
    members: Array.from({ length: bookingCount }, (_, index) => ({ profileId: profiles[index % profileCount].profileId })),
    profiles,
    summary: {
      bookingCount,
      candidateCount,
      conflictCount,
      emailCount: 1,
      phoneCount: contradictory ? 2 : 1,
      profileCount,
      sourceCustomerCount: 1,
      v1BookingCount: bookingCount,
      v2BookingCount: 0,
    },
  };
}

test("single active profile can be described as potentially safe without asserting a decision", () => {
  const preview = previewModule.deriveCustomerIdentityDecisionPreview("confirm_same_identity", detailFixture(), null);
  assert.equal(preview.status, "potentially_safe");
  assert.equal(preview.canonicalProfileSafe, true);
  assert.equal(preview.merge, "No");
  assert.equal(preview.singleProfileOperation, "Sí");
  assert.match(preview.summary, /no confirma que esa sea la decisión correcta/);
});

test("multiple profiles require canonical selection and a safe merge contract", () => {
  const preview = previewModule.deriveCustomerIdentityDecisionPreview("confirm_same_identity", detailFixture({ bookingCount: 12, profileCount: 12 }), null);
  assert.equal(preview.status, "requires_additional_contract");
  assert.equal(preview.canonicalProfileSafe, false);
  assert.equal(preview.merge, "Sí, potencialmente");
  assert.ok(preview.blockers.some((item) => item.includes("canonical profile seguro")));
  assert.ok(preview.blockers.some((item) => item.includes("merge SAFE")));
});

test("merged or blocked profiles fail closed", () => {
  const merged = previewModule.deriveCustomerIdentityDecisionPreview("confirm_same_identity", detailFixture({ profileStatus: "merged" }), null);
  const blocked = previewModule.deriveCustomerIdentityDecisionPreview("confirm_same_identity", detailFixture({ profileStatus: "blocked" }), null);
  assert.equal(merged.status, "blocked");
  assert.equal(blocked.status, "blocked");
  assert.equal(merged.canonicalProfileSafe, false);
});

test("contradictory signals and mixed link states remain explicit blockers", () => {
  const contradictory = previewModule.deriveCustomerIdentityDecisionPreview("confirm_same_identity", detailFixture({ contradictory: true }), null);
  const mixed = previewModule.deriveCustomerIdentityDecisionPreview("confirm_same_identity", detailFixture({ candidateCount: 1, conflictCount: 1 }), null);
  assert.equal(contradictory.status, "requires_additional_contract");
  assert.ok(contradictory.blockers.some((item) => item.includes("contradictorias")));
  assert.equal(mixed.status, "requires_additional_contract");
  assert.ok(mixed.blockers.some((item) => item.includes("conflict y candidate")));
});

test("partial evidence and absent canonical fail closed", () => {
  const summary = detailFixture({ bookingCount: 12, profileCount: 12 }).summary;
  const preview = previewModule.deriveCustomerIdentityDecisionPreview("confirm_same_identity", null, summary);
  assert.equal(preview.status, "blocked");
  assert.equal(preview.canonicalProfileSafe, false);
  assert.equal(preview.reservations, 12);
});

test("large groups stay count-based and do not require per-profile requests", () => {
  const preview = previewModule.deriveCustomerIdentityDecisionPreview("confirm_same_identity", detailFixture({ bookingCount: 256, profileCount: 249 }), null);
  assert.equal(preview.profiles, 249);
  assert.equal(preview.reservations, 256);
  assert.match(preview.changes.join(" "), /Hasta 256 links/);
  assert.doesNotMatch(source, /fetch\(|getJson\(|POST|PATCH|DELETE/);
});

test("keep related remains informational while separation requires an unimplemented contract", () => {
  const detail = detailFixture({ bookingCount: 12, profileCount: 12 });
  const related = previewModule.deriveCustomerIdentityDecisionPreview("keep_related", detail, null);
  const separate = previewModule.deriveCustomerIdentityDecisionPreview("keep_separate", detail, null);
  assert.equal(related.status, "informational");
  assert.equal(related.merge, "No");
  assert.equal(separate.status, "requires_additional_contract");
  assert.ok(separate.blockers.some((item) => item.includes("regla persistente de separación")));
});

test("shared account is a neutral non-identity classification and remains non-persistible", () => {
  const detail = detailFixture({ bookingCount: 12, contradictory: true, profileCount: 12 });
  const preview = previewModule.deriveCustomerIdentityDecisionPreview("shared_account", detail, null);
  assert.equal(preview.status, "requires_additional_contract");
  assert.equal(preview.merge, "No");
  assert.match(preview.summary, /sin concluir identidad física/);
  assert.ok(preview.blockers.some((item) => item.includes("Clasificación aún no persistible")));
  assert.ok(!preview.blockers.some((item) => item.includes("Corroborar señales suficientes")));
});

test("all four choices are labels only and expose no execution API", () => {
  assert.deepEqual(Object.keys(previewModule.CUSTOMER_IDENTITY_DECISION_LABELS), ["confirm_same_identity", "keep_related", "keep_separate", "shared_account"]);
  for (const label of ["Confirmar misma identidad", "Mantener relacionados", "Mantener separados", "Cuenta compartida / terceros"]) {
    assert.ok(Object.values(previewModule.CUSTOMER_IDENTITY_DECISION_LABELS).includes(label));
  }
});
