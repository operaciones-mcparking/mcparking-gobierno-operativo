import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const read = (filePath) => fs.readFileSync(path.join(rootDir, filePath), "utf8");
const count = (text, pattern) => [...text.matchAll(pattern)].length;

const actions = read("src/app/admin/actions.ts");
const roleSaveStart = actions.indexOf("export async function saveProcessRoleProfiles");
const roleSaveEnd = actions.indexOf("const processMetricFrequencies", roleSaveStart);
const roleSaveAction = actions.slice(roleSaveStart, roleSaveEnd);
const createForm = read("src/app/procesos/nuevo/create-process-draft-form.tsx");
const createPage = read("src/app/procesos/nuevo/page.tsx");
const detailLink = read("src/app/procesos/process-detail-modal.tsx");
const editPage = read("src/app/procesos/[processId]/editar/page.tsx");
const mapper = read("src/app/procesos/process-master/process-master-mapper.ts");
const roleData = read("src/lib/procesos/process-role-profiles.ts");
const roleEditor = read("src/app/procesos/process-master/process-role-profiles-editor.tsx");
const relations = read("src/lib/procesos/process-master-relations.ts");
const roleTable = read("src/app/procesos/process-master/process-role-profiles-table.tsx");
const documentLayout = read("src/app/procesos/process-master/process-document-layout.tsx");
const sheet = read("src/app/procesos/process-master/process-master-sheet.tsx");
const types = read("src/app/procesos/process-master/process-master-types.ts");
const validation = read("src/app/procesos/process-master/process-master-validation.ts");
const data = read("src/lib/dashboard/data.ts");
const migration = read("supabase/migrations/20260813160000_complete_process_master_v1_contract.sql");
const docs = read("docs/auditoria_cabecera_ficha_proceso.md");

assert.match(migration, /\bbegin;[\s\S]*\bcommit;/i, "migration must be transactional");
assert.doesNotMatch(migration, /\b(drop|delete|truncate)\b/i, "migration must not contain destructive statements");
assert.equal(count(migration, /add column if not exists (supplier_origin|process_inputs|process_outputs|client_destination) text/g), 4, "migration must add exactly four separated flow fields");
assert.match(migration, /PRECHECK \(read-only\)/, "migration must document a read-only precheck");
assert.match(migration, /POSTCHECK \(read-only\)/, "migration must document a read-only postcheck");
assert.match(migration, /create or replace function public\.create_process_draft_with_document_header/, "migration must update the existing atomic draft RPC");
assert.match(migration, /nullif\(p_process->>'purpose', ''\)/, "draft RPC must map purpose to the existing objective column");
assert.match(migration, /inputs_providers[\s\S]*null[\s\S]*outputs_clients[\s\S]*null/, "new drafts must not invent values for combined legacy fields");
assert.doesNotMatch(migration, /update public\.processes|insert into public\.process_role_profiles|insert into public\.metrics|insert into public\.risks|insert into public\.controls/i, "migration must not backfill historical business data");

assert.match(sheet, /<h2[\s\S]*process\.process\.name[\s\S]*ValueBadge/, "readonly header must present the process name and status once");
for (const label of ["Codigo", "Dueno del proceso", "Ultima edicion"]) {
  assert.match(sheet, new RegExp(`label="${label}"`), `readonly header must include ${label}`);
}
assert.doesNotMatch(createForm + editPage, /name="effective_date"|type="date"/, "last-edited date must not be manually editable");
assert.match(sheet, /masterUpdatedAt \?\? process\.process\.createdAt/, "readonly header must prefer master_updated_at and fall back to created_at");
assert.doesNotMatch(createForm + editPage, /name="process_code"|name="version"/, "code and version must stay outside browser editing");
assert.match(createForm + editPage, /name="area_id"/, "operation type must edit the existing process area relationship");
assert.match(createForm, /name="company_id"/, "create must expose the real company selector");
assert.doesNotMatch(editPage, /name="company_id"/, "edit must keep company read-only until context reconciliation is supported");
assert.match(createForm + editPage, /name="process_type"/, "process type must remain available for the process map");
assert.doesNotMatch(sheet + createForm + editPage, /Editor maestro|EDITOR MAESTRO/, "V1 must not duplicate an editor master header");
assert.doesNotMatch(sheet, /Estado operativo|Estado documental|Criticidad/, "readonly V1 header must hide technical duplicates");

const section1Title = 'title={"1. PROP\\u00d3SITO Y ALCANCE"}';
const section2Title = 'title={"2. ENTRADAS, ACTIVIDADES Y SALIDAS"}';
const section1 = sheet.slice(sheet.indexOf(section1Title), sheet.indexOf(section2Title));
const createSection1 = createForm.slice(createForm.indexOf(section1Title), createForm.indexOf(section2Title));
for (const concept of ["PROP\\u00d3SITO", "Inicio", "Fin", "Alcance"]) assert.match(section1, new RegExp(concept.replace("\\", "\\\\"), "i"), "section 1 must include " + concept);
assert.match(documentLayout, /function ProcessDocumentSection[\s\S]*w-full bg-navy[\s\S]*uppercase[\s\S]*text-white/, "document sections must use the approved full-width header");
assert.match(documentLayout, /function ProcessDocumentRow[\s\S]*sm:grid-cols-\[9rem_minmax\(0,1fr\)\]/, "document rows must stack on mobile and use label-content columns on desktop");
assert.match(section1, /divide-y divide-line[\s\S]*ProcessDocumentRow label=\{"PROP\\u00d3SITO"\}[\s\S]*ProcessDocumentRow label="Inicio"[\s\S]*ProcessDocumentRow label="Fin"[\s\S]*ProcessDocumentRow label="Alcance"/, "readonly section 1 must use four homogeneous documentary rows");
for (const legacy of ["Definicion", "Objetivo", "Resultado esperado", "KPI", "Entradas", "Salidas", "Criticidad"]) assert.doesNotMatch(section1, new RegExp(legacy), "section 1 must not include " + legacy);
assert.match(editPage, /ProcessDocumentRow label=\{"PROP\\u00d3SITO"\}[\s\S]*name="purpose"[\s\S]*ProcessDocumentRow label="Inicio"[\s\S]*name="process_start"[\s\S]*ProcessDocumentRow label="Fin"[\s\S]*name="process_end"[\s\S]*ProcessDocumentRow label="Alcance"[\s\S]*name="scope"/, "section 1 editor must expose its V1 fields in documentary rows");
assert.doesNotMatch(editPage.slice(editPage.indexOf("const purposeEditor"), editPage.indexOf("const flowEditor")), /lg:grid-cols-3/, "section 1 editor must not return to three columns");
assert.match(createSection1, /ProcessDocumentRow label=\{"PROP\\u00d3SITO"\}[\s\S]*name="purpose"[\s\S]*ProcessDocumentRow label="INICIO"[\s\S]*name="process_start"[\s\S]*ProcessDocumentRow label="FIN"[\s\S]*name="process_end"[\s\S]*ProcessDocumentRow label="ALCANCE"[\s\S]*name="scope"/, "create section 1 must use the same four documentary rows");
assert.doesNotMatch(createSection1, /lg:grid-cols-3|Define el motivo/, "create section 1 must not preserve the old grid or subtitle");

const section2 = sheet.slice(sheet.indexOf(section2Title), sheet.indexOf('title={"3. ROLES, RESPONSABILIDADES Y AUTORIDAD"}'));
const createSection2 = createForm.slice(createForm.indexOf(section2Title), createForm.indexOf("</ProcessDocumentSection>", createForm.indexOf(section2Title)));
const flowTable = sheet.slice(sheet.indexOf("function FlowTable"), sheet.indexOf("function RolesTable"));
assert.match(section2, /2\. ENTRADAS, ACTIVIDADES Y SALIDAS[\s\S]*FlowTable/, "readonly section 2 must keep its complete documentary flow");
assert.match(sheet, /id: "flow"[\s\S]*ACTIVIDADES CLAVE \/ ETAPAS[\s\S]*\{stageEditor\}/, "edit wizard section 2 must keep StageEditor interleaved");
assert.match(flowTable, /ProcessDocumentRow label="PROVEEDOR \/ ORIGEN"[\s\S]*ProcessDocumentRow label="ENTRADAS"[\s\S]*ProcessDocumentRow label="ACTIVIDADES CLAVE \/ ETAPAS"[\s\S]*ProcessDocumentRow label="SALIDAS"[\s\S]*ProcessDocumentRow label="CLIENTE \/ DESTINO"/, "readonly section 2 must use five ordered documentary rows");
assert.match(createSection2, /PROVEEDOR \/ ORIGEN[\s\S]*ENTRADAS[\s\S]*ACTIVIDADES CLAVE \/ ETAPAS[\s\S]*SALIDAS[\s\S]*CLIENTE \/ DESTINO/, "create section 2 must use the same five-row order");
assert.match(createForm, /prepareDraftForWizard[\s\S]*autoCreateProcessDraft\(formData, "wizard_next"\)[\s\S]*wizard=create&step=2/, "create must persist one draft before entering the real stage workflow");
const flowEditorSource = editPage.slice(editPage.indexOf("const flowEditor"), editPage.indexOf("return (", editPage.indexOf("const flowEditor")));
for (const token of ['className="contents"', 'className="order-1"', 'className="order-2"', 'className="order-4"', 'className="order-5"']) assert.ok(flowEditorSource.includes(token), "edit flow must preserve " + token);
assert.doesNotMatch(createForm + editPage, /name="activities|name="key_activities/, "activities must not be duplicated in free text");

for (const concept of ["Proveedor / Origen", "Entradas", "Actividades clave", "Salidas", "Cliente / Destino"]) assert.match(sheet, new RegExp(concept.replace("/", "\\/"), "i"), `section 2 must include ${concept}`);
for (const field of ["supplier_origin", "process_inputs", "process_outputs", "client_destination"]) {
  assert.match(types + data + mapper + editPage + createForm, new RegExp(field), `V1 flow field ${field} must be carried end to end`);
}
assert.match(sheet, /function StageList[\s\S]*stages\.map[\s\S]*sort_order/, "activities must derive from ordered active stage DTO rows");
assert.doesNotMatch(createForm + editPage, /name="activities|name="key_activities/, "activities must not be duplicated in free text");

for (const concept of ["Rol", "Responsabilidad", "Autoridad", "Rendici"]) assert.match(roleTable + roleEditor, new RegExp(concept), `section 3 must include ${concept}`);
assert.doesNotMatch(roleTable + roleEditor, /Persona actual|current_person_name/, "section 3 must not expose a current-person column");
assert.match(types, /role_id: string[\s\S]*responsibility: string \| null[\s\S]*authority: string \| null[\s\S]*accountability: string \| null/, "section 3 DTO must reference official role UUIDs and profile fields");
assert.match(roleData, /from\('process_role_profiles'\)[\s\S]*status[\s\S]*active[\s\S]*v_role_dictionary/, "saved process role profiles must be the only documentary source");
assert.doesNotMatch(roleData, /process_roles|ownerRoleId|participationByRole/, "stage participation and global owner must not feed section 3");
assert.match(roleData, /v_role_dictionary[\s\S]*role_status[\s\S]*active/, "section 3 must only expose active official roles");
assert.doesNotMatch(roleTable + roleEditor, /RoleBadges|Due\\u00f1o|Dueño|Usuario|Consultado|Respaldo|Backup/, "section 3 must not render participation badges");
assert.match(roleEditor, /^'use client';[\s\S]*useState<EditableRoleProfile\[\]>[\s\S]*addRow[\s\S]*updateRow[\s\S]*removeRow/, "edit must keep the complete block in local state");
assert.match(roleEditor, /useProcessMasterSaveSection[\s\S]*\+ Agregar rol/, "edit must expose local row creation and register one coordinated block save");
assert.doesNotMatch(roleEditor, /Guardar rol(?:<|')|<form|action=\{action\}/, "section 3 must not submit one form per row");
assert.doesNotMatch(roleEditor, /Un rol no puede aparecer más de una vez|occupiedByOtherRow|disabled=\{occupiedByOtherRow/, "client must allow repeated official roles");
assert.match(roleEditor, /Trash2[\s\S]*removeRow/, "edit must remove rows locally before the final save");
assert.doesNotMatch(roleSaveAction, /Un rol no puede aparecer más de una vez|onConflict: 'process_id,role_id'/, "server must allow repeated official roles");
assert.match(roleSaveAction, /v_role_dictionary[\s\S]*role_status[\s\S]*process\.company_id/, "server must validate active official roles against the process company");
assert.match(roleSaveAction, /process_role_profiles[\s\S]*\.update\([\s\S]*\.eq\('id', row\.profileId\)[\s\S]*\.insert\([\s\S]*\.delete\(\)[\s\S]*\.in\('id', removedProfileIds\)/, "one server action must synchronize inserts, updates and removals by profile id");
assert.doesNotMatch(roleSaveAction, /process_roles|redirect\(|done\(|revalidatePath\(/, "block save must not touch stage roles, navigate or refresh the page");
assert.match(createForm, /id: "roles"[\s\S]*Disponible en el borrador del proceso/, "create must reserve roles until the sequential draft transition reaches EDIT");
assert.match(editPage + roleEditor, /initiallyAddRow=\{messages\.addRole === "1"\}[\s\S]*initiallyAddRow \? \[\.\.\.loadedRows/, "role intent must create the first local row automatically in edit");
assert.match(roleEditor, /process-draft-scroll:\$\{processId\}:role[\s\S]*sessionStorage\.removeItem[\s\S]*window\.scrollTo/, "role transition must restore the saved scroll position");
assert.doesNotMatch(roleEditor, /\bSave\b|Guardar roles, responsabilidades y autoridad/, "section 3 must not expose a parallel save action");
assert.match(roleEditor, /h-\[72px\] min-h-\[72px\][\s\S]*resize-y/, "section 3 textareas must start compact while remaining vertically resizable");
assert.match(roleEditor, /roleProfileEditorGrid = 'lg:grid-cols-\[minmax\(10rem,0\.8fr\)[\s\S]*_2\.5rem\]'/, "section 3 editor must reserve proportional content columns and a minimal delete column");
assert.match(roleEditor, /lg:items-center[\s\S]*lg:justify-self-center lg:self-center/, "section 3 delete action must be vertically centered on desktop");
assert.match(roleEditor, /border-t border-\[#e7edf2\][\s\S]*\+ Agregar rol/, "section 3 footer must retain the compact add action");for (const concept of ["Indicador", "Formula / criterio", "Meta", "Frecuencia", "Responsable"]) assert.match(sheet, new RegExp(concept.replace("/", "\\/")), `section 4 must include ${concept}`);
assert.match(types, /ProcessMasterMetric[\s\S]*formula: string \| null[\s\S]*target: string \| null[\s\S]*responsible_roles: ProcessMasterResponsibleRole\[\]/, "section 4 DTO must support multiple official responsible roles and documentary metric fields");
for (const concept of ["Riesgo / oportunidad", "Control", "Evidencia", "Responsable"]) assert.match(sheet, new RegExp(concept.replace("/", "\\/")), `section 5 must include ${concept}`);
assert.match(types, /risk_type: "risk" \| "opportunity"[\s\S]*controls: ProcessMasterControl\[\]/, "section 5 DTO must model risks and opportunities with related controls");
assert.match(types, /ProcessMasterControl[\s\S]*evidence: string \| null[\s\S]*responsible_roles: ProcessMasterResponsibleRole\[\]/, "controls must expose evidence and multiple official responsible role UUIDs");

assert.match(createPage + editPage, /getRoleDictionary/, "create and edit must reuse the official role dictionary abstraction");
assert.match(data, /from\("v_role_dictionary"\)/, "official roles must originate in v_role_dictionary");
assert.match(actions, /from\("v_role_dictionary"\)[\s\S]*role_status[\s\S]*active/, "server-side owner validation must reject non-official or inactive roles");
assert.doesNotMatch(createForm + editPage + sheet + detailLink, /SUPABASE_SERVICE_ROLE_KEY|createClient\(|\.from\(/, "browser-facing components must not use privileged database clients");
assert.doesNotMatch(createForm + editPage, /fetch\(|api\/procesos/, "V1 writes must remain Server Actions without a new browser endpoint");
assert.match(detailLink, /fetch\([\s\S]*api\/estructura\/procesos\/[\s\S]*process\.process_id[\s\S]*\/ficha/, "Ver ficha must use the authorized structure readonly endpoint");
assert.match(detailLink, /ProcessMasterSheet mode="readonly"/, "Ver ficha must reuse the shared clean readonly sheet");
assert.doesNotMatch(detailLink, /Objetivo|Resultado esperado|Entradas y proveedores|KPI basico/, "Ver ficha action must not preserve a parallel legacy reader");

for (const field of ["supplier_origin", "process_inputs", "process_outputs", "client_destination"]) assert.match(validation, new RegExp(`key: "${field}"`), `${field} must participate in activation readiness`);
assert.doesNotMatch(validation, /key: "inputs_providers"|key: "outputs_clients"|key: "basic_kpi"|key: "expected_result"/, "activation must not depend on hidden legacy fields");
assert.match(sheet + roleTable, /Sin actividades activas|Sin roles participantes documentados|Sin indicadores documentados|Sin riesgos, controles u oportunidades documentados/, "legacy and incomplete records must have clean empty states");
assert.match(sheet, /text\(process\.process\.processCode, "Sin codigo"\)/, "historical records must remain null-safe without code backfill");
assert.doesNotMatch(sheet + createForm + editPage, /6\. Documentos|7\. Ciclo de mejora|pdca_(plan|do|check|act)/i, "documents and PDCA must stay outside V1 UI");

assert.match(docs, /## Contrato Ficha de Proceso V1/, "audit document must contain the V1 contract section");
assert.match(roleSaveAction, /saveProcessRoleProfiles[\s\S]*process_role_profiles/, "section 3 must synchronize profiles through one server action");
assert.match(roleData, /createSupabaseAdminClient/, "section 3 reads must stay server-only behind the existing admin client");
assert.match(relations, /^import "server-only";[\s\S]*metric_responsible_roles[\s\S]*control_responsible_roles/, "sections 4 and 5 must load responsible-role bridges server-side");
assert.match(actions, /saveProcessMetrics[\s\S]*saveProcessRisksAndControls/, "sections 4 and 5 must expose central block-save actions");

console.log("process-master-v1-contract: 80/80 OK");
