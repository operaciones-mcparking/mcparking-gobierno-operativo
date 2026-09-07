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
const route = readFileSync("src/app/api/orquestador/customer-window/customers/route.ts", "utf8");
const admin = readFileSync("src/lib/orquestador/supabase-admin.ts", "utf8");

test("period presets use the Santiago calendar and default to today", () => {
  assert.equal(helper.getSantiagoDateKey(new Date("2026-01-01T02:00:00.000Z")), "2025-12-31");
  assert.deepEqual(helper.getCustomerPeriodRange("today", "2026-09-07"), { from: "2026-09-07", to: "2026-09-07" });
  assert.deepEqual(helper.getCustomerPeriodRange("yesterday", "2026-09-07"), { from: "2026-09-06", to: "2026-09-06" });
  assert.deepEqual(helper.getCustomerPeriodRange("last7", "2026-09-07"), { from: "2026-09-01", to: "2026-09-07" });
  assert.deepEqual(helper.getCustomerPeriodRange("last14", "2026-09-07"), { from: "2026-08-25", to: "2026-09-07" });
  assert.deepEqual(helper.getCustomerPeriodRange("thisMonth", "2026-09-07"), { from: "2026-09-01", to: "2026-09-07" });
  assert.deepEqual(helper.getCustomerPeriodRange("previousMonth", "2026-09-07"), { from: "2026-08-01", to: "2026-08-31" });
  assert.deepEqual(helper.getCustomerPeriodRange("previousMonth", "2026-01-07"), { from: "2025-12-01", to: "2025-12-31" });
  assert.match(view, /useState<CustomerPeriodPreset>\("today"\)/);
  assert.match(helperSource, /timeZone: "America\/Santiago"/);
});

test("custom periods require complete ordered calendar dates", () => {
  assert.equal(helper.isValidCustomerPeriodRange({ from: "2026-08-31", to: "2026-09-07" }), true);
  assert.equal(helper.isValidCustomerPeriodRange({ from: "2026-09-08", to: "2026-09-07" }), false);
  assert.equal(helper.isValidCustomerPeriodRange({ from: "2026-02-30", to: "2026-03-01" }), false);
  assert.match(view, /type CustomPeriodMode = "single" \| "range"/);
  assert.match(view, /Un día[\s\S]*Rango de fechas[\s\S]*type="date"[\s\S]*Aplicar/);
  assert.match(view, /onApply\("custom", nextRange\)/);
});

test("period selector follows the compact dashboard popover pattern", () => {
  const selectorBlock = view.slice(view.indexOf("function CustomerPeriodSelector"), view.indexOf("function CustomerPeriodTable"));
  for (const label of ["Hoy", "Ayer", "Últimos 7 días", "Últimos 14 días", "Este mes", "Mes anterior", "Personalizado"]) {
    assert.match(view, new RegExp(label));
  }
  assert.match(selectorBlock, /<span>Periodo<\/span>/);
  assert.match(selectorBlock, /aria-controls=\{popoverId\}[\s\S]*aria-expanded=\{isOpen\}/);
  assert.match(selectorBlock, /Rango seleccionado[\s\S]*displayDate\(range\.from\)[\s\S]*displayDate\(range\.to\)/);
  assert.match(selectorBlock, /Fecha de compra · America\/Santiago/);
  assert.match(selectorBlock, /addEventListener\("pointerdown"/);
  assert.match(selectorBlock, /event\.key === "Escape"/);
});

test("period and advanced filters live in a global unclipped view surface", () => {
  const clientView = view.slice(view.indexOf('section === "campanas"'), view.indexOf('<div className="grid items-stretch gap-5 xl:grid-cols-2">'));
  assert.match(clientView, /<section aria-label="Filtros de clientes"/);
  assert.match(clientView, /relative z-20 mt-5 overflow-visible/);
  assert.match(clientView, /CustomerPeriodSelector[\s\S]*CustomerFilterPopover/);
  assert.doesNotMatch(clientView, /<Panel title="Clientes"/);
  assert.doesNotMatch(clientView, /Clientes con compras creadas dentro del período seleccionado\./);
  assert.match(view, /absolute left-0 top-full z-30/);
});

test("advanced filters use an accessible responsive popover", () => {
  const filterBlock = view.slice(view.indexOf("function CustomerFilterPopover"), view.indexOf("function CustomerPeriodTable"));
  assert.match(filterBlock, /aria-controls=\{popoverId\}[\s\S]*aria-expanded=\{isOpen\}[\s\S]*aria-haspopup="dialog"/);
  assert.match(filterBlock, /activeCount > 0 \? `Filtros \(\$\{activeCount\}\)` : "Filtros"/);
  assert.match(filterBlock, /w-\[min\(calc\(100vw-2rem\),32rem\)\][\s\S]*sm:left-auto sm:right-0/);
  assert.match(filterBlock, /Nuevo \/ Frecuente[\s\S]*Tier[\s\S]*Pack \/ No Pack[\s\S]*Comportamiento/);
  assert.match(filterBlock, /addEventListener\("pointerdown"/);
  assert.match(filterBlock, /event\.key === "Escape"/);
});

test("active filters render distinct removable chips and a clear action", () => {
  assert.match(view, /const activeFilters = \[[\s\S]*lifecycleStatus[\s\S]*tier[\s\S]*packStatus[\s\S]*brandBehavior/);
  assert.match(view, /activeCount=\{activeFilters\.length\}/);
  assert.match(view, /aria-label="Filtros activos"/);
  assert.match(view, /aria-label=\{`Quitar filtro \$\{filter\.label\}`\}/);
  assert.match(view, /onClick=\{\(\) => updateFilter\(filter\.key, ""\)\}/);
  assert.match(view, /onClick=\{clearFilters\}[\s\S]*Limpiar filtros/);
});

test("client issues independent bounded MCP EAP and OKP period requests", () => {
  assert.match(view, /const PERIOD_PAGE_SIZE = 25/);
  assert.match(view, /void loadFamily\("MCP_EAP", mcpPage\)/);
  assert.match(view, /void loadFamily\("OKP", okpPage\)/);
  assert.match(view, /action: "list-by-period"[\s\S]*family[\s\S]*from: periodRange\.from[\s\S]*pageSize: String\(PERIOD_PAGE_SIZE\)[\s\S]*to: periodRange\.to/);
  assert.match(view, /<CustomerPeriodTable error=\{mcpError\} family="MCP_EAP"/);
  assert.match(view, /<CustomerPeriodTable error=\{okpError\} family="OKP"/);
});

test("families keep independent pagination loading errors and stale protection", () => {
  for (const state of ["mcpPage", "okpPage", "mcpLoading", "okpLoading", "mcpError", "okpError"]) {
    assert.match(view, new RegExp(`\\[${state},`));
  }
  assert.match(view, /Record<CustomerFamily, AbortController \| null>/);
  assert.match(view, /requestControllers\.current\[family\]\?\.abort\(\)/);
  assert.match(view, /requestControllers\.current\[family\] !== controller/);
  assert.match(view, /function resetFamilyPages\(\) \{ setMcpPage\(1\); setOkpPage\(1\); \}/);
  const abortBlock = view.slice(view.indexOf("function abortFamilyRequests"), view.indexOf("function applyPeriod"));
  assert.match(abortBlock, /requestControllers\.current\.MCP_EAP\?\.abort\(\)/);
  assert.match(abortBlock, /requestControllers\.current\.OKP\?\.abort\(\)/);
  const applyPeriodBlock = view.slice(view.indexOf("function applyPeriod"), view.indexOf("function updateFilter"));
  assert.match(applyPeriodBlock, /abortFamilyRequests\(\)/);
  assert.match(applyPeriodBlock, /setPeriodRange\(range\)[\s\S]*resetFamilyPages\(\)/);
});

test("all classification filters send the approved backend enums", () => {
  for (const parameter of ["lifecycleStatus", "tier", "packStatus", "brandBehavior"]) {
    assert.match(view, new RegExp(`params\\.set\\("${parameter}", ${parameter}\\)`));
  }
  for (const value of ["NEW", "FREQUENT", "IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "DIAMOND", "PACK", "NO_PACK", "ONLY_MCP_EAP", "ONLY_OKP", "MIGRATED_TO_MCP_EAP", "MIGRATED_TO_OKP", "ALTERNATING"]) {
    assert.match(view, new RegExp(`value="${value}"|"${value}"`));
  }
  const filterBlock = view.slice(view.indexOf("function CustomerFilterPopover"), view.indexOf("function CustomerPeriodTable"));
  for (const filter of ["lifecycleStatus", "tier", "packStatus", "brandBehavior"]) {
    assert.match(filterBlock, new RegExp(`onChange\\(\\"${filter}\\", event\\.target\\.value\\)`));
  }
  const updateBlock = view.slice(view.indexOf("function updateFilter"), view.indexOf("async function toggleCriteria"));
  assert.match(updateBlock, /abortFamilyRequests\(\)[\s\S]*resetFamilyPages\(\)/);
  assert.match(updateBlock, /function clearFilters\(\)[\s\S]*setLifecycleStatus\(""\)[\s\S]*setTier\(""\)[\s\S]*setPackStatus\(""\)[\s\S]*setBrandBehavior\(""\)[\s\S]*resetFamilyPages\(\)/);
});

test("period tables prioritize page identities and never use UUID as the main label", () => {
  assert.match(view, /const email = customer\.emails\[0\]/);
  assert.match(view, /const phone = customer\.phones\[0\]/);
  assert.match(view, /const primary = email \?\? phone \?\? "Identidad no disponible"/);
  const identityBlock = view.slice(view.indexOf("function CustomerIdentity"), view.indexOf("function CustomerPeriodSelector"));
  assert.doesNotMatch(identityBlock, /customerId/);
  assert.match(identityBlock, /truncate text-xs font-medium leading-5 text-navy/);
  assert.match(identityBlock, /title=\{primary\}/);
  assert.match(identityBlock, /mt-0\.5 truncate text-\[11px\] font-normal leading-4 text-slate-500/);
  assert.match(identityBlock, /title=\{secondary\}/);
  assert.doesNotMatch(identityBlock, /break-all|font-semibold/);
  assert.match(view, /title=\{isOkp \? "Clientes OKP" : "Clientes MCP \/ EAP"\}/);
  assert.doesNotMatch(view, /Clientes con al menos una compra (?:MCP o EAP|OKP) dentro del período seleccionado\./);
});

test("tables expose period and historical counts without commercial amounts", () => {
  for (const field of ["purchasesInPeriod", "firstPurchaseInPeriod", "lastPurchaseInPeriod", "totalReservations", "mcpCount", "eapCount", "okpCount", "okpExpressCount", "okpRioClarilloCount", "okpOtrosCount"]) {
    assert.match(view, new RegExp(field));
  }
  const tableBlock = view.slice(view.indexOf("function CustomerPeriodTable"), view.indexOf("function CustomerDetailDrawer"));
  assert.doesNotMatch(tableBlock, /totalSpend|averageTicket|source_total_amount|\bamount\b|\brevenue\b/i);
});

test("both customer tables use the same compact four-column contract", () => {
  const tableBlock = view.slice(view.indexOf("function CustomerPeriodTable"), view.indexOf("function CustomerDetailDrawer"));
  assert.match(tableBlock, /\["Cliente", "Tipo cliente", "Qty", "Perfil comercial"\]/);
  for (const removedHeader of ["Compras período", "Nuevo / Frecuente", "Última compra histórica", "Pack / Boleta", "Comportamiento", "OKP total", "Express", "Río Clarillo", "Otros", "Acción"]) {
    assert.doesNotMatch(tableBlock, new RegExp(removedHeader));
  }
  assert.doesNotMatch(tableBlock, /\["MCP", "EAP"\]/);
  assert.doesNotMatch(tableBlock, /Ver detalle/);
  assert.match(tableBlock, /<DataTable minWidth="0px">/);
  assert.match(tableBlock, /<colgroup>[\s\S]*w-\[34%\][\s\S]*w-\[28%\]/);
  assert.match(tableBlock, /text-\[10px\] font-medium uppercase leading-4 tracking-\[0\.08em\] text-slate-500/);
  assert.match(tableBlock, /px-3 py-2 align-middle/);
  assert.match(tableBlock, /text-xs font-normal leading-5 text-slate-700/);
  assert.doesNotMatch(tableBlock, /<DataTableCell strong>/);
});

test("customer type and commercial behavior reuse compact recovery badges", () => {
  assert.match(view, /import \{ ValueBadge, type BadgeTone \} from "@\/components\/dashboard\/badge"/);
  assert.match(view, /function TierBadge/);
  const tableBlock = view.slice(view.indexOf("function CustomerPeriodTable"), view.indexOf("function CustomerDetailDrawer"));
  assert.match(tableBlock, /<ValueBadge tone=\{lifecycleTone\(customer\.lifecycleStatus\)\}>[\s\S]*<TierBadge value=\{customer\.tier\}/);
  assert.match(tableBlock, /<ValueBadge tone=\{behaviorTone\(customer\.brandBehavior\)\}>[\s\S]*packLabel\(customer\.packStatus\)/);
  assert.doesNotMatch(tableBlock, /<ValueBadge tone=\{packTone\(customer\.packStatus\)\}>/);
  assert.match(tableBlock, /mt-0\.5 truncate text-\[11px\] font-normal leading-4 text-slate-500/);
});

test("behavior badges preserve positive loss and neutral semantics", () => {
  assert.match(view, /MIGRATED_TO_MCP_EAP: "success"/);
  assert.match(view, /ONLY_MCP_EAP: "success"/);
  assert.match(view, /MIGRATED_TO_OKP: "danger"/);
  assert.match(view, /ONLY_OKP: "info"/);
  assert.match(view, /ALTERNATING: "warning"/);
});

test("pack status is presentation-only Pack or Boleta", () => {
  assert.match(view, /if \(value === "PACK"\) return "Pack"/);
  assert.match(view, /if \(value === "NO_PACK"\) return "Boleta"/);
  assert.match(view, /packLabel\(customer\.packStatus\)/);
});

test("the complete row opens the existing on-demand customer detail", () => {
  const tableBlock = view.slice(view.indexOf("function CustomerPeriodTable"), view.indexOf("function CustomerDetailDrawer"));
  assert.match(tableBlock, /className="cursor-pointer/);
  assert.match(tableBlock, /onClick=\{\(\) => onSelectCustomer\(customer\)\}/);
  assert.match(tableBlock, /event\.key === "Enter" \|\| event\.key === " "/);
  assert.match(view, /onSelectCustomer=\{\(customer\) => void selectCustomer\(customer\.customerId, customer\)\}/);
  assert.doesNotMatch(tableBlock, /<button[\s\S]*Ver detalle/);
});

test("customer detail uses an accessible right drawer and visual timeline", () => {
  const drawerBlock = view.slice(view.indexOf("function CustomerDetailDrawer"), view.indexOf("export function CustomerWindowView"));
  assert.match(drawerBlock, /aria-modal="true"[\s\S]*role="dialog"/);
  assert.match(drawerBlock, /justify-end bg-navy\/35/);
  assert.match(drawerBlock, /<aside[\s\S]*h-full[\s\S]*md:max-w-2xl/);
  assert.match(drawerBlock, /aria-label="Cerrar detalle del cliente"/);
  assert.match(drawerBlock, /<ol className="relative[\s\S]*sm:before:left-1\/2/);
  assert.match(drawerBlock, /const isOkpBooking = booking\.source === "OKP"/);
  assert.match(drawerBlock, /sm:col-start-3 sm:ml-1[\s\S]*sm:col-start-1 sm:mr-1/);
  assert.match(drawerBlock, /<details[\s\S]*<summary/);
  assert.match(drawerBlock, /purchase_created_at[\s\S]*source_booking_code[\s\S]*planned_arrival_at[\s\S]*planned_departure_at/);
  assert.doesNotMatch(drawerBlock, /totalSpend|averageTicket|source_total_amount|\brevenue\b/i);
});

test("customer detail keeps a compact managerial summary and secondary information collapsed", () => {
  const drawerBlock = view.slice(view.indexOf("function CustomerDetailDrawer"), view.indexOf("export function CustomerWindowView"));
  const headerBlock = drawerBlock.slice(drawerBlock.indexOf("<header"), drawerBlock.indexOf("</header>"));
  const summaryStart = drawerBlock.indexOf(">Resumen</h3>");
  const moreInformationStart = drawerBlock.indexOf("<details", summaryStart);
  const summaryBlock = drawerBlock.slice(summaryStart, moreInformationStart);
  const moreInformationBlock = drawerBlock.slice(moreInformationStart, drawerBlock.indexOf("Historial de compras", moreInformationStart));

  assert.match(headerBlock, /primaryIdentity[\s\S]*secondaryIdentity[\s\S]*lifecycleLabel[\s\S]*TierBadge[\s\S]*behaviorLabel/);
  assert.doesNotMatch(headerBlock, /packLabel|packStatus|Pack|Boleta/);
  for (const label of ["Primera compra", "Última compra", "Reservas históricas", "Reservas futuras", "Packs / Boletas", "Comportamiento"]) {
    assert.match(summaryBlock, new RegExp(label.replace("/", "\\/")));
  }
  for (const secondaryLabel of ["MCP", "EAP", "OKP", "Última marca", "Último parking", "Teléfonos conocidos", "Emails conocidos", "Patentes conocidas"]) {
    assert.doesNotMatch(summaryBlock, new RegExp(secondaryLabel));
    assert.match(moreInformationBlock, new RegExp(secondaryLabel));
  }
  assert.match(summaryBlock, /summary\.purchaseCount/);
  assert.match(summaryBlock, /summary\.packCount[\s\S]*summary\.nonPackCount/);
  assert.match(summaryBlock, /summary\.needsReview === true[\s\S]*Requiere revisión/);
  assert.doesNotMatch(drawerBlock, /Sin observaciones/);
  assert.match(moreInformationBlock, /<details className=[\s\S]*<summary[^>]*>Más información<\/summary>/);
  assert.doesNotMatch(moreInformationBlock, /<details[^>]*\sopen(?:=|\s|>)/);
});

test("customer detail uses lightweight typography and source-family timeline accents", () => {
  const drawerBlock = view.slice(view.indexOf("function CustomerDetailDrawer"), view.indexOf("export function CustomerWindowView"));
  const headerBlock = drawerBlock.slice(drawerBlock.indexOf("<header"), drawerBlock.indexOf("</header>"));

  assert.match(headerBlock, /text-xs font-medium text-slate-500">Detalle del cliente/);
  assert.match(headerBlock, /text-base font-medium leading-5 text-navy/);
  assert.match(headerBlock, /text-xs font-normal text-slate-500/);
  assert.doesNotMatch(headerBlock, /Detalle del cliente<\/p>[\s\S]*uppercase/);
  assert.match(headerBlock, /ValueBadge tone=\{lifecycleTone\([\s\S]*TierBadge[\s\S]*ValueBadge tone=\{behaviorTone/);
  assert.match(drawerBlock, /text-sm font-medium text-slate-700">Resumen/);
  assert.match(drawerBlock, /text-sm font-medium text-slate-700">Historial de compras/);
  assert.match(drawerBlock, /isOkpBooking \? "bg-\[#00a86b\] ring-\[#a7dcc4\]" : "bg-\[#2563a6\] ring-\[#b7cee5\]"/);
  assert.match(drawerBlock, /border-l-\[#00a86b\][\s\S]*bg-\[#f8fcfa\]/);
  assert.match(drawerBlock, /border-l-\[#2563a6\][\s\S]*bg-\[#f8fbfe\]/);
  assert.match(drawerBlock, /text-xs font-medium text-navy">\{displayDate\(booking\.purchase_created_at\)\}/);
  assert.match(drawerBlock, /text-\[11px\] font-normal text-slate-500">\{familyLabel\}/);
});

test("eligible ticket events show canonical economics without changing timeline sides", () => {
  const drawerBlock = view.slice(view.indexOf("function CustomerDetailDrawer"), view.indexOf("export function CustomerWindowView"));

  assert.match(drawerBlock, /booking\.is_pack === false[\s\S]*booking\.economic_eligible === true[\s\S]*booking\.economics_available === true/);
  assert.match(drawerBlock, /displayClp\(booking\.paid_amount\)/);
  assert.match(drawerBlock, /ADR \{displayAdr\(booking\.paid_adr\)\}/);
  assert.match(drawerBlock, /displayDiscountPercentage\(booking\.discount_percentage\)/);
  for (const label of ["Precio pagado", "Precio lista", "Descuento \\$", "Descuento %", "Días", "ADR pagado", "ADR lista"]) {
    assert.match(drawerBlock, new RegExp(label));
  }
  assert.match(drawerBlock, /booking\.is_pack \? "Pack" : "Boleta"/);
  assert.match(drawerBlock, /showEconomics \? <div/);
  assert.match(drawerBlock, /showEconomics \? <>/);
  assert.match(drawerBlock, /sm:col-start-3 sm:ml-1[\s\S]*sm:col-start-1 sm:mr-1/);
});

test("timeline hides zero discount and shows uninterpreted source promo codes", () => {
  const drawerBlock = view.slice(view.indexOf("function CustomerDetailDrawer"), view.indexOf("export function CustomerWindowView"));

  assert.match(view, /booking\.source === "OKP" \? booking\.coupon_code : booking\.promotion_code/);
  assert.match(drawerBlock, /discountPercentage !== null && discountPercentage > 0/);
  assert.match(drawerBlock, />Código \{promotionCode\}<\/p>/);
  assert.match(drawerBlock, /const promotionCode = showEconomics \? promotionCodeForBooking\(booking\) : null/);
  assert.doesNotMatch(drawerBlock, /Banco|BIN|Convenio|Campaña|Promoción bancaria/);
  assert.match(drawerBlock, /sm:col-start-3 sm:ml-1[\s\S]*sm:col-start-1 sm:mr-1/);
});

test("economic presentation preserves CLP zero percentages and nulls", () => {
  assert.match(view, /new Intl\.NumberFormat\("es-CL", \{ currency: "CLP", maximumFractionDigits: 0, style: "currency" \}\)/);
  assert.match(view, /amount === null[\s\S]*"No disponible"/);
  assert.match(view, /maximumFractionDigits: 1/);
  assert.match(view, /percentage > 0 \? `-\$\{formatted\}%` : `\$\{formatted\}%`/);
  assert.doesNotMatch(view, /booking\.(?:paid_amount|paid_adr|list_adr) \|\| 0/);
});

test("customer panels share desktop width height and bounded vertical scrolling", () => {
  assert.match(view, /grid items-stretch gap-5 xl:grid-cols-2[\s\S]*family="MCP_EAP"[\s\S]*family="OKP"/);
  const tableBlock = view.slice(view.indexOf("function CustomerPeriodTable"), view.indexOf("function CustomerDetailDrawer"));
  assert.match(tableBlock, /max-h-\[640px\] overflow-y-auto overscroll-contain/);
  assert.doesNotMatch(tableBlock, /overflow-x-auto/);
});

test("drawer closes without resetting period filters or family pages", () => {
  const closeStart = view.indexOf("const closeCustomerDrawer");
  const closeBlock = view.slice(closeStart, view.indexOf("useEffect", closeStart));
  assert.match(closeBlock, /setDrawerCustomerId\(null\)/);
  assert.match(closeBlock, /setSelectedCustomer\(null\)/);
  assert.doesNotMatch(closeBlock, /setMcpPage|setOkpPage|setPeriodRange|setLifecycleStatus|setTier|setPackStatus|setBrandBehavior/);
  assert.match(view, /event\.key === "Escape"[\s\S]*closeCustomerDrawer\(\)/);
  assert.match(view, /document\.body\.style\.overflow = "hidden"/);
});

test("tables remain the only entry point to the on-demand customer detail", () => {
  assert.doesNotMatch(view, /Buscar cliente específico|customer-search-value|searchCustomers|action=search/);
  assert.match(view, /CustomerPeriodTable[\s\S]*onSelectCustomer=\{\(customer\) => void selectCustomer\(customer\.customerId, customer\)\}/);
  assert.match(view, /CustomerDetailDrawer/);
  assert.match(view, /async function selectCustomer[\s\S]*Promise\.all\(\[[\s\S]*action=summary[\s\S]*action=bookings/);
  const familyBlock = view.slice(view.indexOf("const loadFamily"), view.indexOf("useEffect"));
  assert.doesNotMatch(familyBlock, /action=summary|action=bookings/);
});

test("classification criteria stay collapsed and load official rules once", () => {
  assert.match(view, /useState\(false\)/);
  assert.match(view, /Criterios de clasificación/);
  assert.match(view, /action=criteria/);
  assert.match(view, /if \(!nextOpen \|\| criteria \|\| criteriaLoading\) return/);
  assert.match(view, /criteriaOpen && criteriaError/);
  assert.match(view, /criterionNumber\(criteria, "tier"/);
  assert.match(view, /gold_historical_reservations/);
  assert.match(view, /gold_reservations_24m/);
  assert.match(view, /gold_median_gap_days/);
  assert.match(view, /aria-controls="customer-window-classification-criteria"/);
  const tablesIndex = view.lastIndexOf('<div className="grid items-stretch gap-5 xl:grid-cols-2">');
  const criteriaIndex = view.lastIndexOf('title="Criterios de clasificación"');
  assert.ok(criteriaIndex > tablesIndex, "classification criteria must render below both customer tables");
});

test("criteria action remains admin-only and service role stays server-side", () => {
  assert.ok(route.indexOf("getActiveAdminUser()") < route.indexOf('action === "criteria"'));
  assert.match(route, /action === "criteria"[\s\S]*getCustomerWindowClassificationCriteria/);
  assert.match(admin, /customer_window_get_classification_criteria/);
  assert.doesNotMatch(view + route, /SUPABASE_SERVICE_ROLE_KEY|createClient\(|\.rpc\(/);
  assert.doesNotMatch(view, /server-only|lib\/auth\/access|components\/dashboard\/shell/);
});
