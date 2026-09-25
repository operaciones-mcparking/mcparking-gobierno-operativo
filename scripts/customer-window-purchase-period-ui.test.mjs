import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const helperSource = readFileSync("src/lib/customer-window/customer-period.ts", "utf8");
const helperJavaScript = ts.transpileModule(helperSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
const helper = await import(`data:text/javascript;base64,${Buffer.from(helperJavaScript).toString("base64")}`);
const view = readFileSync("src/app/orquestador/customer-window-view.tsx", "utf8");
const representations = readFileSync("src/lib/customer-window/customer-representations-v2.ts", "utf8");
const route = readFileSync("src/app/api/orquestador/customer-window/customers/route.ts", "utf8");
const admin = readFileSync("src/lib/orquestador/supabase-admin.ts", "utf8");

function sourceBlock(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing source block start: ${start}`);
  const endIndex = source.indexOf(end, startIndex);
  assert.notEqual(endIndex, -1, `missing source block end: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("period presets use the Santiago calendar and default to today", () => {
  assert.equal(helper.getSantiagoDateKey(new Date("2026-01-01T02:00:00.000Z")), "2025-12-31");
  assert.deepEqual(helper.getCustomerPeriodRange("today", "2026-09-07"), { from: "2026-09-07", to: "2026-09-07" });
  assert.deepEqual(helper.getCustomerPeriodRange("yesterday", "2026-09-07"), { from: "2026-09-06", to: "2026-09-06" });
  assert.deepEqual(helper.getCustomerPeriodRange("last7", "2026-09-07"), { from: "2026-09-01", to: "2026-09-07" });
  assert.deepEqual(helper.getCustomerPeriodRange("last14", "2026-09-07"), { from: "2026-08-25", to: "2026-09-07" });
  assert.deepEqual(helper.getCustomerPeriodRange("thisMonth", "2026-09-07"), { from: "2026-09-01", to: "2026-09-07" });
  assert.deepEqual(helper.getCustomerPeriodRange("previousMonth", "2026-09-07"), { from: "2026-08-01", to: "2026-08-31" });
  assert.match(view, /useState<CustomerPeriodPreset>\("today"\)/);
  assert.match(helperSource, /timeZone: "America\/Santiago"/);
});

test("custom periods retain complete ordered calendar validation", () => {
  assert.equal(helper.isValidCustomerPeriodRange({ from: "2026-08-31", to: "2026-09-07" }), true);
  assert.equal(helper.isValidCustomerPeriodRange({ from: "2026-09-08", to: "2026-09-07" }), false);
  assert.equal(helper.isValidCustomerPeriodRange({ from: "2026-02-30", to: "2026-03-01" }), false);
  assert.match(view, /type CustomPeriodMode = "single" \| "range"/);
  assert.match(view, /Un día[\s\S]*Rango de fechas[\s\S]*type="date"[\s\S]*Aplicar/);
});

test("the list uses a nullable discriminated v2 representation type", () => {
  const typeBlock = sourceBlock(view, "type CustomerRepresentationListItemV2", "type RepresentationPeriodListV2");
  assert.match(typeBlock, /customerId: string[\s\S]*relatedGroupId: null[\s\S]*representationType: "confirmed_customer"/);
  assert.match(typeBlock, /customerId: null[\s\S]*relatedGroupId: string[\s\S]*representationType: "related_review"/);
  assert.match(typeBlock, /metricScope: "all_confirmed_sources"/);
  assert.match(typeBlock, /metricScope: "mcp_eap_active_snapshot"/);
  assert.match(representations, /representationKey !== `\$\{representationType\}:\$\{representationId\}`/);
});

test("the main view loads one v2 list and one v2 facets request per period", () => {
  const listBlock = sourceBlock(view, "const loadRepresentations", "const loadPeriodFacets");
  const facetsBlock = sourceBlock(view, "const loadPeriodFacets", "const loadRefreshHealth");
  assert.match(listBlock, /action: "list-by-period-v2"[\s\S]*from: periodRange\.from[\s\S]*page: String\(page\)[\s\S]*pageSize: String\(PERIOD_PAGE_SIZE\)[\s\S]*to: periodRange\.to/);
  assert.match(facetsBlock, /action: "period-facets-v2"[\s\S]*from: periodRange\.from[\s\S]*to: periodRange\.to/);
  assert.equal((listBlock.match(/getCustomerWindowJsonWithRetry\(/g) ?? []).length, 1);
  assert.equal((facetsBlock.match(/getCustomerWindowJsonWithRetry\(/g) ?? []).length, 1);
  assert.doesNotMatch(view, /action: "list-by-period"/);
  assert.doesNotMatch(view, /action: "period-metrics"/);
  assert.match(route, /No fue posible consultar representaciones por periodo\.\", 500, result\.retryable/);
  assert.match(route, /No fue posible consultar las facetas del periodo\.\", 500, result\.retryable/);
  assert.match(admin, /normalizeCustomerWindowRepresentationListV2\(data\)[\s\S]*retryable: false/);
  assert.match(admin, /normalizeCustomerWindowPeriodFacetsV2\(data\)[\s\S]*retryable: false/);
});

test("operational search is debounced server-side and opens the existing drawers", () => {
  assert.match(view, /placeholder="Buscar por email, teléfono, reserva o cliente\.\.\."/);
  assert.match(view, /window\.setTimeout\([\s\S]*action: "search-v2"[\s\S]*limit: "20"[\s\S]*query[\s\S]*300\)/);
  assert.match(view, /searchController\.current\?\.abort\(\)/);
  assert.match(view, /normalizeCustomerWindowRepresentationSearchV2\(body\)/);
  assert.match(view, /onSelect=\{selectSearchRepresentation\}/);
  assert.match(view, /selectSearchRepresentation[\s\S]*selectRepresentation/);
  assert.match(view, /Coincidencia histórica/);
  assert.match(view, /Relacionado \/ revisión/);
  assert.doesNotMatch(view, /fuzzy|similarity/i);
});

test("v2 loading keeps abort stale response error and pagination behavior", () => {
  assert.match(view, /representationController\.current\?\.abort\(\)/);
  assert.match(view, /facetsController\.current\?\.abort\(\)/);
  assert.match(view, /representationController\.current !== controller/);
  assert.match(view, /facetsController\.current !== controller/);
  assert.match(view, /setRepresentationError\(cause instanceof Error/);
  assert.match(view, /setPeriodFacetsError\(cause instanceof Error/);
  assert.match(view, /onPageChange=\{setRepresentationPage\}/);
  assert.match(view, /disabled=\{loading \|\| list\.page <= 1\}/);
  assert.match(view, /disabled=\{loading \|\| list\.page >= pageCount\}/);
  assert.match(view, /setRepresentationPage\(1\)/);
  assert.match(view, /representationRequest\.current\?\.key === requestKey/);
  assert.match(view, /facetsRequest\.current\?\.key === requestKey/);
  assert.match(view, /setRepresentationList\(nextList\)/);
  assert.match(view, /setPeriodFacets\(nextFacets\)/);
  assert.doesNotMatch(sourceBlock(view, "const loadRepresentations", "const loadPeriodFacets"), /setRepresentationList\(emptyRepresentationList\)/);
  assert.doesNotMatch(sourceBlock(view, "const loadPeriodFacets", "const loadRefreshHealth"), /setPeriodFacets\(null\)/);
});

test("transient loading preserves rendered data and delays visible errors until retries finish", () => {
  const facetsBlock = sourceBlock(view, "function CustomerRepresentationFacets", "function CustomerRepresentationTable");
  const tableBlock = sourceBlock(view, "function CustomerRepresentationTable", "function SecondaryViewHeader");
  assert.match(facetsBlock, /loading && !facets[\s\S]*Actualizando datos/);
  assert.match(facetsBlock, /facets \?[\s\S]*loading \? "Actualizando\.\.\."/);
  assert.match(tableBlock, /loading && list\.items\.length === 0[\s\S]*Actualizando datos/);
  assert.match(tableBlock, /loading && list\.items\.length > 0[\s\S]*Actualizando\.\.\./);
});

test("refreshing to healthy reloads the current period once without coupling every health poll", () => {
  const healthBlock = sourceBlock(view, "const loadRefreshHealth", "const closeCustomerDrawer");
  assert.match(healthBlock, /previousStatus === "refreshing" && nextHealth\.status === "healthy"/);
  assert.match(healthBlock, /Promise\.allSettled\(\[loadPeriodFacets\(\), loadRepresentations\(representationPage\)\]\)/);
  assert.equal((healthBlock.match(/loadPeriodFacets\(\)/g) ?? []).length, 1);
  assert.equal((healthBlock.match(/loadRepresentations\(representationPage\)/g) ?? []).length, 1);
});

test("facets expose representations confirmed related and period bookings", () => {
  const facetsBlock = sourceBlock(view, "function CustomerRepresentationFacets", "function CustomerRepresentationTable");
  assert.match(facetsBlock, /"Representaciones", value: facets\.totalRepresentations/);
  assert.match(facetsBlock, /"Confirmados", value: facets\.confirmedRepresentations/);
  assert.match(facetsBlock, /"Relacionados \/ revisión", value: facets\.relatedReviewRepresentations/);
  assert.match(facetsBlock, /"Reservas del período", value: facets\.totalBookingsInPeriod/);
  assert.match(facetsBlock, /Incluye grupos relacionados pendientes de revisión/);
});

test("rows use representationKey and map only fields supplied by v2", () => {
  const tableBlock = sourceBlock(view, "function CustomerRepresentationTable", "function SecondaryViewHeader");
  assert.match(tableBlock, /key=\{representation\.representationKey\}/);
  for (const field of ["totalReservations", "reservationsInPeriod", "firstPurchaseAt", "lastPurchaseAt", "lastBookingAtInPeriod"]) {
    assert.match(tableBlock, new RegExp(`representation\\.${field}`));
  }
  for (const heading of ["Representación", "Reservas", "Primera compra", "Última compra", "Última reserva del período"]) {
    assert.match(tableBlock, new RegExp(heading));
  }
  assert.match(tableBlock, /representationContactLines\(representation\.contactSummary\)/);
  assert.match(tableBlock, /contact\.email/);
  assert.match(tableBlock, /contact\.phone/);
  assert.doesNotMatch(tableBlock, /lifecycle|tier|economics/i);
});

test("confirmed and related rows use sober explicit badges", () => {
  const tableBlock = sourceBlock(view, "function CustomerRepresentationTable", "function SecondaryViewHeader");
  assert.match(tableBlock, /isConfirmed \? "success" : "warning"/);
  assert.match(tableBlock, /isConfirmed \? "Confirmado" : "Relacionado \/ revisión"/);
  assert.doesNotMatch(tableBlock, /Inválido|Cliente malo|Conflicto crítico|Error/);
});

test("related selection opens Customer 360 and never reaches the legacy customerId path", () => {
  const selectionBlock = sourceBlock(view, "function selectRepresentation", "async function changeTimelinePage");
  assert.match(selectionBlock, /setSelectedRepresentation\(representation\)/);
  assert.match(selectionBlock, /setDrawerCustomerId\(null\)/);
  assert.doesNotMatch(selectionBlock, /selectCustomer\(/);
  assert.match(view, /<Customer360Drawer[\s\S]*representation=\{selectedRepresentation\}/);
  assert.doesNotMatch(selectionBlock, /selectCustomer\(representation\.relatedGroupId\)/);
});

test("related drawer makes two eager requests and one on-demand identity detail request", () => {
  const drawerBlock = sourceBlock(view, "function RelatedReviewDrawer", "function CustomerDetailDrawer");
  assert.equal((drawerBlock.match(/getJson\(/g) ?? []).length, 3);
  assert.match(drawerBlock, /action: "summary-v2"[\s\S]*representationId: representation\.representationId[\s\S]*representationType: representation\.representationType/);
  assert.match(drawerBlock, /action: "bookings-v2"[\s\S]*page: String\(bookingsPage\)[\s\S]*pageSize: String\(TIMELINE_PAGE_SIZE\)/);
  assert.match(drawerBlock, /normalizeCustomerWindowRepresentationSummaryV2/);
  assert.match(drawerBlock, /normalizeCustomerWindowRepresentationBookingsResponseV2/);
  assert.match(drawerBlock, /action: "identity-resolution-detail-v2"/);
  assert.match(drawerBlock, /relatedGroupId: representation\.relatedGroupId/);
  assert.match(drawerBlock, /normalizeCustomerWindowIdentityResolutionDetailV2/);
  assert.doesNotMatch(drawerBlock, /customerId=/);
});

test("related drawer presents the compact confirmed-style shell and review summary", () => {
  const drawerBlock = sourceBlock(view, "function RelatedReviewDrawer", "function CustomerDetailDrawer");
  for (const label of [
    "Relacionado / revisión",
    "Reservas históricas",
    "En revisión",
    "Primera compra",
    "Última compra",
    "Perfiles relacionados",
    "Emails distintos",
    "Teléfonos distintos",
    "Clientes de origen distintos",
    "Conflictos",
    "Candidatos",
    "Reservas resueltas con V1",
    "Reservas resueltas con V2",
    "Coincidencia email + teléfono",
    "Coincidencia cliente de origen + email",
  ]) assert.ok(drawerBlock.includes(label), `missing related drawer label: ${label}`);
  assert.match(drawerBlock, /<CustomerRepresentationDrawerFrame badge="Relacionado \/ revisión"/);
  assert.match(drawerBlock, /<CustomerSummaryMetrics fields=/);
  assert.doesNotMatch(drawerBlock, /title="Revisión de identidad requerida"/);
});

test("related drawer opens on summary and purchase history with four additional views", () => {
  const drawerBlock = sourceBlock(view, "function RelatedReviewDrawer", "function CustomerDetailDrawer");
  assert.match(drawerBlock, /useState<"main" \| "contacts" \| "purchase" \| "information" \| "resolve">\("main"\)/);
  assert.match(drawerBlock, /relatedView === "main" \? <CustomerPurchaseTimeline/);
  assert.doesNotMatch(drawerBlock, /relatedView === "purchase" \? <CustomerPurchaseTimeline/);
  assert.match(drawerBlock, /label: "Contactos", onClick: \(\) => setRelatedView\("contacts"\)/);
  assert.match(drawerBlock, /label: "Perfil de compra", onClick: \(\) => setRelatedView\("purchase"\)/);
  assert.match(drawerBlock, /label: "Más información", onClick: \(\) => setRelatedView\("information"\)/);
  assert.match(drawerBlock, /label: "Resolver identidad", onClick: \(\) => void openIdentityResolution\(\)/);
  assert.match(drawerBlock, /relatedView === "resolve" \? <CustomerIdentityResolutionPanel/);
  assert.doesNotMatch(drawerBlock, /role="tablist"|aria-selected=/);
});

test("changing related representation resets main and aborts all related requests", () => {
  const drawerBlock = sourceBlock(view, "function RelatedReviewDrawer", "function CustomerDetailDrawer");
  assert.match(drawerBlock, /summaryController\.current\?\.abort\(\);[\s\S]*setRelatedView\("main"\)[\s\S]*\}, \[representation\]\)/);
  assert.equal((drawerBlock.match(/getJson\(/g) ?? []).length, 3);
  assert.match(drawerBlock, /identityDetailController\.current\?\.abort\(\)/);
  assert.equal((drawerBlock.match(/onBack=\{\(\) => setRelatedView\("main"\)\}/g) ?? []).length, 4);
});

test("related header uses the latest observed email and phone without selecting a preferred contact", () => {
  const drawerBlock = sourceBlock(view, "function RelatedReviewDrawer", "function CustomerDetailDrawer");
  const sharedBlock = sourceBlock(view, "type CustomerPurchaseTimelineItem", "function RelatedReviewDrawer");
  assert.match(sharedBlock, /function sortObservedContactsByLastSeen/);
  assert.match(sharedBlock, /contact\.lastSeenAt \? Date\.parse\(contact\.lastSeenAt\)/);
  assert.match(sharedBlock, /Number\.isFinite\(parsedLastSeenAt\)/);
  assert.match(sharedBlock, /left\.index - right\.index/);
  assert.match(drawerBlock, /const latestObservedEmail = relatedEmails\[0\]\?\.value \?\? null/);
  assert.match(drawerBlock, /const latestObservedPhone = relatedPhones\[0\]\?\.value \?\? null/);
  assert.match(drawerBlock, /latestObservedEmail \?\? latestObservedPhone \?\? "Cliente relacionado"/);
  assert.match(drawerBlock, /latestObservedEmail \? latestObservedPhone : null/);
  assert.doesNotMatch(drawerBlock, /preferred|primaryEmail|primaryPhone/i);
});

test("related drawer never reconstructs a primary contact", () => {
  const drawerBlock = sourceBlock(view, "function RelatedReviewDrawer", "function CustomerDetailDrawer");
  assert.match(drawerBlock, /No se ha definido un contacto principal mientras la identidad permanezca en revisión/);
  assert.match(drawerBlock, /summary\.observedEmails/);
  assert.match(drawerBlock, /summary\.observedPhones/);
  assert.doesNotMatch(drawerBlock, /summary\.(?:email|phone|plate|name)|booking\.(?:plate|sourceCustomerId|bookingCode)/);
  assert.doesNotMatch(drawerBlock, /action=(?:identities|search|summary)&customerId/);
});

test("list contact summaries never invent a primary value", () => {
  const contactBlock = sourceBlock(view, "function representationContactLines", "function CustomerRepresentationTable");
  assert.match(contactBlock, /contact\.singleEmail/);
  assert.match(contactBlock, /contact\.singlePhone/);
  assert.match(contactBlock, /emailCount > BigInt\(0\)[\s\S]*emails/);
  assert.match(contactBlock, /phoneCount > BigInt\(0\)[\s\S]*teléfonos/);
  assert.match(contactBlock, /related \? " relacionados" : ""/);
});

test("related bookings expose only approved fields and paginate large groups server-side", () => {
  const drawerBlock = sourceBlock(view, "function RelatedReviewDrawer", "function CustomerDetailDrawer");
  for (const label of ["Email observado", "Teléfono observado", "Llegada / salida", "Parking", "Estado", "Monto", "Duración", "Pack", "Boleta", "Promoción"]) {
    assert.match(drawerBlock, new RegExp(label));
  }
  for (const field of ["sourceCreatedAt", "email", "phone", "plannedArrivalAt", "plannedDepartureAt", "parking", "brand", "bookingStatus", "paidAmount", "durationDays", "isPack", "promotionCode"]) {
    assert.match(drawerBlock, new RegExp(`booking\\.${field}`));
  }
  assert.match(drawerBlock, /representationPageCount\(bookings\?\.total \?\? representation\.totalReservations, TIMELINE_PAGE_SIZE\)/);
  assert.match(drawerBlock, /setBookingsPage\(bookingsPage - 1\)/);
  assert.match(drawerBlock, /setBookingsPage\(bookingsPage \+ 1\)/);
  const timelineBlock = sourceBlock(view, "function CustomerPurchaseTimeline({", "function RelatedReviewDrawer");
  assert.match(timelineBlock, /disabled=\{loading \|\| page >= pageCount\}/);
});

test("large related contact sets use compact internally scrollable lists", () => {
  const drawerBlock = sourceBlock(view, "function RelatedReviewDrawer", "function CustomerDetailDrawer");
  assert.match(drawerBlock, /summary\.observedEmails\.map\(\(contact\) => <li/);
  assert.match(drawerBlock, /summary\.observedPhones\.map\(\(contact\) => <li/);
  assert.equal((drawerBlock.match(/max-h-72 divide-y divide-\[#e4edf4\] overflow-y-auto overscroll-contain/g) ?? []).length, 2);
  assert.match(drawerBlock, /summary\.contactSummary\.emailCount/);
  assert.match(drawerBlock, /summary\.contactSummary\.phoneCount/);
  assert.doesNotMatch(drawerBlock, /summary\.observed(?:Emails|Phones)\.map\(\(contact\) => <(?:article|div) className="rounded/);
});

test("related summary and bookings have independent loading and safe error states", () => {
  const drawerBlock = sourceBlock(view, "function RelatedReviewDrawer", "function CustomerDetailDrawer");
  assert.match(drawerBlock, /loading=\{summaryLoading\}/);
  assert.match(drawerBlock, /summaryError[\s\S]*No fue posible cargar el resumen de esta representación/);
  assert.match(drawerBlock, /loading=\{bookingsLoading\}/);
  assert.match(drawerBlock, /bookingsError \? "No fue posible cargar las reservas de esta representación\."/);
  assert.match(drawerBlock, /summaryController\.current\?\.abort\(\)/);
  assert.match(drawerBlock, /bookingsController\.current\?\.abort\(\)/);
});

test("identity resolution explains one or multiple profiles without scoring", () => {
  const panelBlock = sourceBlock(view, "function CustomerIdentityResolutionPanel", "function CustomerEconomicsPanel");
  assert.match(panelBlock, /profileCount === BigInt\(1\)[\s\S]*Reservas en un mismo perfil/);
  assert.match(panelBlock, /profileCount > BigInt\(1\)[\s\S]*Varios perfiles relacionados/);
  assert.match(panelBlock, /Las reservas ya están asociadas al mismo perfil/);
  assert.doesNotMatch(panelBlock, /score|probabilidad|porcentaje de coincidencia/i);
});

test("identity resolution derives only supported contact and corroboration signals", () => {
  const panelBlock = sourceBlock(view, "function CustomerIdentityResolutionPanel", "function CustomerEconomicsPanel");
  assert.match(panelBlock, /emailCount === BigInt\(1\)[\s\S]*Email exacto compartido/);
  assert.match(panelBlock, /phoneCount === BigInt\(1\)[\s\S]*Teléfono consistente/);
  assert.match(panelBlock, /sourceCustomerCount === BigInt\(1\)[\s\S]*Cliente de origen compartido/);
  assert.match(panelBlock, /hasExactEmailPhoneCorroboration/);
  assert.match(panelBlock, /hasSourceCustomerEmailCorroboration/);
  assert.match(panelBlock, /emailCount > BigInt\(1\)[\s\S]*Varios emails observados/);
  assert.match(panelBlock, /phoneCount > BigInt\(1\)[\s\S]*Varios teléfonos observados/);
});

test("identity resolution treats possible shared accounts as a neutral hypothesis", () => {
  const panelBlock = sourceBlock(view, "function CustomerIdentityResolutionPanel", "function CustomerEconomicsPanel");
  assert.match(panelBlock, /emailCount === BigInt\(1\) && phoneCount > BigInt\(1\) && profileCount > BigInt\(1\) && bookingCount >= BigInt\(4\)/);
  assert.match(panelBlock, /cuenta compradora compartida o a reservas realizadas para terceros/);
  assert.match(panelBlock, /Es una hipótesis contextual, no una conclusión de identidad/);
  assert.doesNotMatch(panelBlock, /cliente incorrecto|conflictivo|error de cliente/i);
});

test("identity resolution reuses contacts and timeline with one scoped on-demand request", () => {
  const panelBlock = sourceBlock(view, "function CustomerIdentityResolutionPanel", "function CustomerEconomicsPanel");
  const drawerBlock = sourceBlock(view, "function RelatedReviewDrawer", "function CustomerDetailDrawer");
  assert.match(panelBlock, /<CustomerRelatedContacts contacts={detail\?\.relatedContacts \?\? null}/);
  assert.match(panelBlock, /\{timeline\}/);
  assert.match(drawerBlock, /timeline=\{<CustomerPurchaseTimeline/);
  assert.equal((drawerBlock.match(/getJson\(/g) ?? []).length, 3);
  assert.match(drawerBlock, /relatedGroupId: representation\.relatedGroupId/);
  assert.match(drawerBlock, /if \(identityDetail \|\| identityDetailLoading \|\| !representation\) return/);
  assert.match(drawerBlock, /onRetry=\{\(\) => void openIdentityResolution\(\)\}/);
});

test("identity resolution reports V1 V2 aggregates and renders scoped historical evidence", () => {
  const panelBlock = sourceBlock(view, "function CustomerIdentityResolutionPanel", "function CustomerEconomicsPanel");
  assert.match(panelBlock, /Reservas V1[\s\S]*v1BookingCount/);
  assert.match(panelBlock, /Reservas V2[\s\S]*v2BookingCount/);
  assert.match(panelBlock, /visibleProfiles\.map/);
  assert.match(panelBlock, /visibleEventGroups\.map/);
  assert.match(view, /identityResolutionReasonLabel\(group\.reason\)/);
  assert.match(view, /Detalle técnico de evidencia[\s\S]*event\.reason/);
  assert.match(view, /Object\.entries\(event\.evidence\)/);
  assert.match(view, /contradictory_phone_email[\s\S]*Este teléfono fue observado históricamente asociado a más de un email/);
  assert.match(view, /review_profile_reused_exact[\s\S]*El resolver reutilizó un perfil previamente en revisión/);
  assert.match(panelBlock, /No hay eventos históricos disponibles para las reservas de este grupo/);
});

test("identity resolution renders scoped observed and historical contacts without extra requests", () => {
  const contactsBlock = sourceBlock(view, "function CustomerRelatedContactList", "const CUSTOMER_IDENTITY_PREVIEW_STATUS");
  const drawerBlock = sourceBlock(view, "function RelatedReviewDrawer", "function CustomerDetailDrawer");
  assert.match(contactsBlock, /Contactos relacionados/);
  assert.match(contactsBlock, /Observado en este grupo/);
  assert.match(contactsBlock, /Relacionado históricamente/);
  assert.match(contactsBlock, /Relacionado por historial del mismo teléfono/);
  assert.match(contactsBlock, /Relacionado por historial del mismo email/);
  assert.match(view, /RELATED_CONTACT_INITIAL_LIMIT = 5/);
  assert.match(contactsBlock, /contacts\.slice\(0, RELATED_CONTACT_INITIAL_LIMIT\)/);
  assert.match(contactsBlock, /Ver todos/);
  assert.match(contactsBlock, /Ver menos/);
  assert.match(contactsBlock, /no confirman que pertenezcan a una misma persona/);
  assert.match(contactsBlock, /emails\.length === 0 && contacts\.phones\.length === 0\)\) return null/);
  assert.equal((drawerBlock.match(/getJson\(/g) ?? []).length, 3);
});

test("identity resolution explains contradictory phone history without deciding identity", () => {
  const panelBlock = sourceBlock(view, "function CustomerIdentityResolutionPanel", "function CustomerEconomicsPanel");
  assert.match(panelBlock, /const resolutionSummary = detail\?\.summary \?\? group/);
  assert.match(panelBlock, /detail\.members\.every\(\(member\) => member\.relationshipType === "EXACT_EMAIL"\)/);
  assert.match(panelBlock, /event\.reason === "contradictory_phone_email" \|\| event\.evidence\.contradictorySignals === true/);
  assert.match(panelBlock, /Las reservas comparten un mismo email exacto, pero el historial registra señales de teléfono contradictorias/);
  assert.match(panelBlock, /permanecen relacionadas para revisión y no se confirma una única identidad/);
});

test("identity resolution groups equivalent events and translates evidence", () => {
  const groupingBlock = sourceBlock(view, "function identityResolutionEvidenceText", "function CustomerIdentityReviewSignals");
  assert.match(groupingBlock, /event\.reason[\s\S]*event\.resolverVersion[\s\S]*identityResolutionEvidenceSignature\(event\.evidence\)/);
  assert.match(groupingBlock, /emailsForPhone[\s\S]*teléfono observado está asociado/);
  assert.match(groupingBlock, /phonesForEmail[\s\S]*email fue observado asociado/);
  assert.match(groupingBlock, /emailBookingCount[\s\S]*email aparece/);
  assert.match(groupingBlock, /phoneBookingCount[\s\S]*teléfono aparece/);
  assert.match(groupingBlock, /contradictorySignals[\s\S]*señales históricas contradictorias/);
  assert.match(groupingBlock, /expanded \? <ol[\s\S]*group\.events\.map/);
});

test("identity resolution limits large profile and event collections initially", () => {
  const panelBlock = sourceBlock(view, "function CustomerIdentityResolutionPanel", "function CustomerEconomicsPanel");
  assert.match(view, /const IDENTITY_PROFILE_INITIAL_LIMIT = 8/);
  assert.match(view, /const IDENTITY_EVENT_GROUP_INITIAL_LIMIT = 8/);
  assert.match(panelBlock, /detail\?\.profiles\.slice\(0, IDENTITY_PROFILE_INITIAL_LIMIT\)/);
  assert.match(panelBlock, /eventGroups\.slice\(0, IDENTITY_EVENT_GROUP_INITIAL_LIMIT\)/);
  assert.match(panelBlock, /Ver todos los perfiles/);
  assert.match(panelBlock, /Ver todos los motivos/);
});

test("identity decision controls are preview-only and expose no write action", () => {
  const panelBlock = sourceBlock(view, "function CustomerIdentityResolutionPanel", "function CustomerEconomicsPanel");
  assert.match(panelBlock, /Posibles decisiones/);
  assert.match(panelBlock, /Solo vista previa/);
  assert.match(panelBlock, /CUSTOMER_IDENTITY_DECISION_LABELS/);
  assert.match(panelBlock, /aria-pressed=\{selectedDecision === decision\}/);
  assert.match(panelBlock, /deriveCustomerIdentityDecisionPreview\(selectedDecision, detail, group\)/);
  assert.doesNotMatch(panelBlock, /Guardar|Aplicar|Confirmar cambios|method:\s*"(?:POST|PUT|PATCH|DELETE)"/);
});

test("related identity review remains explanatory and read-only", () => {
  const drawerBlock = sourceBlock(view, "function RelatedReviewDrawer", "function CustomerDetailDrawer");
  assert.match(drawerBlock, /En una etapa posterior este grupo podrá revisarse/);
  assert.doesNotMatch(drawerBlock, /Confirmar como mismo cliente|Mantener separados|onConfirm|onReject|method:\s*"(?:POST|PUT|PATCH|DELETE)"/);
});

test("confirmed selection uses the global Customer 360 locator", () => {
  const selectionBlock = sourceBlock(view, "function selectRepresentation", "async function changeTimelinePage");
  const drawerBlock = sourceBlock(view, "function Customer360Drawer", "function CustomerDetailDrawer");
  assert.match(selectionBlock, /setSelectedRepresentation\(representation\)/);
  assert.doesNotMatch(selectionBlock, /selectCustomer\(/);
  assert.match(drawerBlock, /customer360LocatorFromRepresentation/);
  assert.match(drawerBlock, /\/api\/orquestador\/customer-window\/360\/overview/);
  assert.match(drawerBlock, /\/api\/orquestador\/customer-window\/360\/bookings/);
  assert.match(view, /<Customer360Drawer[\s\S]*representation=\{selectedRepresentation\}/);
});

test("list rendering does not introduce N plus one detail requests", () => {
  const listBlock = sourceBlock(view, "const loadRepresentations", "const loadPeriodFacets");
  const tableBlock = sourceBlock(view, "function CustomerRepresentationTable", "function SecondaryViewHeader");
  assert.doesNotMatch(listBlock + tableBlock, /action=(?:summary|bookings|economics)/);
  assert.doesNotMatch(tableBlock, /getJson|fetch\(/);
});

test("confirmed and related drawers share frame summary actions and purchase timeline", () => {
  const sharedBlock = sourceBlock(view, "type CustomerPurchaseTimelineItem", "function RelatedReviewDrawer");
  const relatedBlock = sourceBlock(view, "function RelatedReviewDrawer", "function CustomerDetailDrawer");
  const drawerBlock = sourceBlock(view, "function CustomerDetailDrawer", "export function CustomerWindowView");
  for (const component of ["CustomerRepresentationDrawerFrame", "CustomerSummaryMetrics", "CustomerContactOverview", "CustomerDrawerActions", "CustomerPurchaseTimeline"]) {
    assert.match(relatedBlock, new RegExp(`<${component}`));
    assert.match(drawerBlock, new RegExp(`<${component}`));
  }
  assert.match(sharedBlock, /aria-modal="true"[\s\S]*role="dialog"/);
  assert.match(sharedBlock, /min-h-0 flex-1 overflow-y-auto overscroll-contain/);
  assert.doesNotMatch(sharedBlock, /overflow-y-scroll/);
  assert.match(drawerBlock, /motion-reduce:transition-none/);
  assert.match(drawerBlock, /const isOkpBooking = booking\.source === "OKP"/);
  assert.match(drawerBlock, /booking\.is_pack === false[\s\S]*booking\.economic_eligible === true[\s\S]*booking\.economics_available === true/);
});

test("confirmed contacts are direct while related contacts remain observed", () => {
  const relatedBlock = sourceBlock(view, "function RelatedReviewDrawer", "function CustomerDetailDrawer");
  const drawerBlock = sourceBlock(view, "function CustomerDetailDrawer", "export function CustomerWindowView");
  assert.match(relatedBlock, /semantics="Observado"/);
  assert.match(relatedBlock, /Emails observados/);
  assert.match(relatedBlock, /Teléfonos observados/);
  assert.match(drawerBlock, /semantics="Directo"/);
  assert.match(drawerBlock, /Emails directos/);
  assert.match(drawerBlock, /Teléfonos directos/);
});

test("both drawers place compact contacts and navigation before purchase history", () => {
  const relatedBlock = sourceBlock(view, "function RelatedReviewDrawer", "function CustomerDetailDrawer");
  const confirmedBlock = sourceBlock(view, "function CustomerDetailDrawer", "export function CustomerWindowView");
  for (const block of [relatedBlock, confirmedBlock]) {
    const summaryIndex = block.indexOf("<CustomerSummaryMetrics");
    const contactsIndex = block.indexOf("<CustomerContactOverview");
    const actionsIndex = block.indexOf("<CustomerDrawerActions");
    const timelineIndex = block.indexOf("<CustomerPurchaseTimeline");
    assert.ok(summaryIndex < contactsIndex && contactsIndex < actionsIndex && actionsIndex < timelineIndex);
  }
});

test("compact contacts support one missing or multiple values and inline expansion", () => {
  const sharedBlock = sourceBlock(view, "function CustomerContactGroup", "function CustomerDrawerActions");
  assert.match(sharedBlock, /items\.slice\(0, 1\)/);
  assert.match(sharedBlock, /Math\.max\(0, items\.length - 1\)/);
  assert.match(sharedBlock, /aria-expanded=\{expanded\}/);
  assert.match(sharedBlock, /`Ver \$\{hiddenCount\} más`/);
  assert.match(sharedBlock, /"Ver menos"/);
  assert.match(sharedBlock, /emptyLabel="Sin email disponible"/);
  assert.match(sharedBlock, /emptyLabel="Sin teléfono disponible"/);
  assert.match(sharedBlock, /sm:grid-cols-2/);
});

test("confirmed and related summaries keep the same compact six-field base", () => {
  const relatedBlock = sourceBlock(view, "function RelatedReviewDrawer", "function CustomerDetailDrawer");
  const confirmedBlock = sourceBlock(view, "function CustomerDetailDrawer", "export function CustomerWindowView");
  const relatedSummary = sourceBlock(relatedBlock, "<CustomerSummaryMetrics fields=", "loading={summaryLoading} />");
  const confirmedSummary = sourceBlock(confirmedBlock, "<CustomerSummaryMetrics fields=", "loading={loading && !summary} />");
  assert.equal((relatedSummary.match(/\{ label:/g) ?? []).length, 6);
  assert.equal((confirmedSummary.match(/\{ label:/g) ?? []).length, 6);
  assert.match(relatedSummary, /Emails observados[\s\S]*Teléfonos observados[\s\S]*Identidad/);
  assert.match(confirmedSummary, /Packs \/ Boletas[\s\S]*Gasto histórico[\s\S]*Identidad/);
});

test("the shared drawer remains responsive and handles empty and paginated histories", () => {
  const sharedBlock = sourceBlock(view, "type CustomerPurchaseTimelineItem", "function RelatedReviewDrawer");
  assert.match(sharedBlock, /w-full[\s\S]*md:max-w-2xl/);
  assert.match(sharedBlock, /sm:grid-cols-2[\s\S]*lg:grid-cols-3/);
  assert.match(sharedBlock, /items\.length === 0[\s\S]*<EmptyState description=\{emptyDescription\}/);
  assert.match(sharedBlock, /disabled=\{loading \|\| page <= 1\}/);
  assert.match(sharedBlock, /disabled=\{loading \|\| page >= pageCount\}/);
  assert.match(sharedBlock, /Página \{page\} de \{pageCount\}/);
});

test("Customer 360 replaces legacy selection reads while criteria remains on demand", () => {
  const selectionBlock = sourceBlock(view, "function selectRepresentation", "async function changeTimelinePage");
  assert.doesNotMatch(selectionBlock, /action=(?:summary|bookings|economics|signals|identities)/);
  assert.match(view, /customer-window\/360\/overview/);
  assert.match(view, /customer-window\/360\/bookings/);
  assert.match(view, /action=criteria/);
  assert.ok(route.indexOf("getActiveAdminUser()") < route.indexOf('action === "criteria"'));
  assert.match(admin, /customer_window_get_classification_criteria/);
});

test("client code does not expose the service role or call Supabase directly", () => {
  assert.doesNotMatch(view + route, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(view, /createClient\(|\.rpc\(/);
});
