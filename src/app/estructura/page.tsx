import { DashboardShell, Panel } from "@/components/dashboard/shell";
import {
  getRoleDictionary,
  getRoleGovernanceProcesses,
  type RoleDictionaryItem,
} from "@/lib/dashboard/data";
import { governanceProcesses, orgRoles, type OrgRole } from "@/lib/dashboard/organization";
import { StructureExplorer } from "./structure-explorer";

function toOrgLevel(level: string): OrgRole["level"] {
  if (level === "executive" || level === "board") return "Direccion";
  if (level === "strategic" || level === "tactical") return "Gestion";
  return "Ejecucion";
}

function fallbackCode(role: RoleDictionaryItem) {
  return role.role_name
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .slice(0, 5)
    .toUpperCase();
}

function roleDictionaryToOrgRoles(roles: RoleDictionaryItem[]): OrgRole[] {
  return roles.map((role) => ({
    area: role.area_name ?? "Sin area",
    code: role.role_code ?? fallbackCode(role),
    id: role.role_id,
    level: toOrgLevel(role.role_level),
    objective: role.role_description ?? "Sin descripcion registrada.",
    orgColumn: role.org_column,
    orgParentRoleId: role.org_parent_role_id,
    orgRow: role.org_row,
    person: role.current_person_name ?? "Sin persona asignada",
    responsibilities: role.responsibilities ?? [],
    sortOrder: role.sort_order,
    title: role.role_name,
  }));
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function findRole(roles: OrgRole[], checks: string[]) {
  return roles.find((role) => {
    const text = normalize(`${role.code} ${role.title} ${role.area}`);
    return checks.some((check) => text.includes(normalize(check)));
  });
}

function findRoleByCodeOrTitle(roles: OrgRole[], codes: string[], titles: string[]) {
  const byCode = roles.find((role) =>
    codes.some((code) => normalize(role.code) === normalize(code)),
  );

  if (byCode) return byCode;

  return roles.find((role) => {
    const title = normalize(role.title);
    return titles.some((check) => title.includes(normalize(check)));
  });
}

function uniqueRoles(roles: Array<OrgRole | undefined>) {
  const seen = new Set<string>();
  return roles.filter((role): role is OrgRole => {
    if (!role) return false;
    const key = `${role.code}-${role.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function roleKey(role: OrgRole) {
  return role.id ?? `${role.code}-${role.title}`;
}

function compareOrgRoles(a: OrgRole, b: OrgRole) {
  return (
    (a.sortOrder ?? 999) - (b.sortOrder ?? 999) ||
    a.title.localeCompare(b.title)
  );
}

function withFallbackHierarchy(roles: OrgRole[]) {
  const general = findRoleByCodeOrTitle(roles, ["GG"], ["Gerente General"]);
  const finance = findRoleByCodeOrTitle(roles, ["FIN"], ["Gerente Finanzas"]);
  const accounting = findRoleByCodeOrTitle(roles, ["CONT"], ["Analista Contable"]);
  const tech = findRoleByCodeOrTitle(roles, ["TI/C"], ["TI / Comercial", "TI Comercial"]);
  const data = findRoleByCodeOrTitle(roles, ["DATOS"], ["Analista Datos"]);
  const operations = findRoleByCodeOrTitle(roles, ["OPS"], ["Jefe Operaciones"]);
  const service = findRoleByCodeOrTitle(roles, ["ATC"], ["Atencion al Cliente", "Atención al Cliente"]);
  const infrastructure = findRoleByCodeOrTitle(roles, ["OBRAS"], ["Obras Civiles"]);

  const defaults = new Map<string, Pick<OrgRole, "orgColumn" | "orgParentRoleId" | "orgRow">>();

  if (general) {
    defaults.set(roleKey(general), { orgColumn: 1, orgParentRoleId: null, orgRow: 1 });
  }

  if (general) {
    uniqueRoles([finance, tech, operations, infrastructure]).forEach((role, index) => {
      defaults.set(roleKey(role), {
        orgColumn: index + 1,
        orgParentRoleId: roleKey(general),
        orgRow: 2,
      });
    });
  }

  if (finance && accounting) {
    defaults.set(roleKey(accounting), {
      orgColumn: 1,
      orgParentRoleId: roleKey(finance),
      orgRow: 3,
    });
  }

  if (tech && data) {
    defaults.set(roleKey(data), {
      orgColumn: 1,
      orgParentRoleId: roleKey(tech),
      orgRow: 3,
    });
  }

  if (operations && service) {
    defaults.set(roleKey(service), {
      orgColumn: 1,
      orgParentRoleId: roleKey(operations),
      orgRow: 3,
    });
  }

  return roles.map((role) => {
    const fallback = defaults.get(roleKey(role));

    if (!fallback) return role;
    if (role.orgParentRoleId) return role;

    return {
      ...role,
      orgColumn: role.orgColumn ?? fallback.orgColumn,
      orgParentRoleId: role.orgParentRoleId ?? fallback.orgParentRoleId,
      orgRow: role.orgRow ?? fallback.orgRow,
    };
  });
}

function OrgNode({
  accent = "navy",
  role,
  size = "normal",
}: {
  accent?: "clay" | "navy" | "sea";
  role: OrgRole;
  size?: "large" | "normal" | "small";
}) {
  const accentClasses = {
    clay: "border-[#ffc107] bg-[#fffaf0]",
    navy: "border-navy bg-navy text-white",
    sea: "border-[#8bb4c0] bg-white",
  };
  const personClasses = accent === "navy" ? "text-clay" : "text-sea";

  return (
    <div
      className={`mx-auto rounded-xl border px-3 py-2 text-center shadow-[0_8px_18px_rgba(2,53,116,0.04)] ${accentClasses[accent]} ${
        size === "large" ? "w-full max-w-[360px]" : size === "small" ? "w-full max-w-[180px]" : "w-full max-w-[200px]"
      }`}
    >
      <p
        className={`text-[11px] font-medium uppercase tracking-[0.12em] ${
          accent === "navy" ? "text-white/70" : "text-slate-500"
        }`}
      >
        {role.area}
      </p>
      <h3 className={`mt-1 font-medium leading-tight ${size === "large" ? "text-lg" : "text-sm"} ${
        accent === "navy" ? "text-white" : "text-navy"
      }`}>
        {role.title}
      </h3>
      <p className={`mt-1.5 text-xs font-medium ${personClasses}`}>{role.person}</p>
    </div>
  );
}

function getLeafCount(role: OrgRole, childrenByParent: Map<string, OrgRole[]>): number {
  const children = childrenByParent.get(roleKey(role)) ?? [];

  if (children.length === 0) return 1;

  return children.reduce((total, child) => total + getLeafCount(child, childrenByParent), 0);
}

function getDepth(role: OrgRole, childrenByParent: Map<string, OrgRole[]>): number {
  const children = childrenByParent.get(roleKey(role)) ?? [];

  if (children.length === 0) return 1;

  return 1 + Math.max(...children.map((child) => getDepth(child, childrenByParent)));
}

type OrgPoint = {
  accent: "navy" | "sea";
  height: number;
  role: OrgRole;
  width: number;
  x: number;
  y: number;
};

type OrgLine = {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
};

function buildSvgOrgChart(roots: OrgRole[], childrenByParent: Map<string, OrgRole[]>) {
  const nodeWidth = 200;
  const rootWidth = 360;
  const nodeHeight = 84;
  const rootHeight = 96;
  const leafGap = 235;
  const levelGap = 136;
  const paddingX = 42;
  const paddingY = 28;
  const nodes: OrgPoint[] = [];
  const lines: OrgLine[] = [];
  let cursorX = paddingX + leafGap / 2;
  let maxDepth = 1;

  function place(role: OrgRole, depth: number): { centerX: number; bottomY: number; topY: number } {
    const children = childrenByParent.get(roleKey(role)) ?? [];
    const width = depth === 0 ? rootWidth : nodeWidth;
    const height = depth === 0 ? rootHeight : nodeHeight;
    const y = paddingY + depth * levelGap;
    let centerX = cursorX;

    maxDepth = Math.max(maxDepth, depth + 1);

    if (children.length > 0) {
      const childPositions = children.map((child) => place(child, depth + 1));
      centerX =
        (childPositions[0].centerX + childPositions[childPositions.length - 1].centerX) / 2;
      const childTopY = childPositions[0].topY;
      const parentBottomY = y + height;
      const midY = parentBottomY + (childTopY - parentBottomY) / 2;

      lines.push({ x1: centerX, x2: centerX, y1: parentBottomY, y2: midY });

      if (childPositions.length > 1) {
        lines.push({
          x1: childPositions[0].centerX,
          x2: childPositions[childPositions.length - 1].centerX,
          y1: midY,
          y2: midY,
        });
      }

      childPositions.forEach((child) => {
        lines.push({ x1: child.centerX, x2: child.centerX, y1: midY, y2: child.topY });
      });
    } else {
      cursorX += leafGap;
    }

    nodes.push({
      accent: depth === 0 ? "navy" : "sea",
      height,
      role,
      width,
      x: centerX - width / 2,
      y,
    });

    return { bottomY: y + height, centerX, topY: y };
  }

  roots.forEach((root, index) => {
    if (index > 0) cursorX += leafGap / 2;
    place(root, 0);
  });

  const width = Math.max(760, cursorX + paddingX - leafGap / 2);
  const height = paddingY * 2 + (maxDepth - 1) * levelGap + rootHeight;

  return { height, lines, nodes, width };
}

function SvgOrgCard({ node }: { node: OrgPoint }) {
  const isRoot = node.accent === "navy";

  return (
    <div
      className={`flex h-full w-full flex-col items-center justify-center rounded-xl border px-3 text-center shadow-[0_8px_18px_rgba(2,53,116,0.04)] ${
        isRoot ? "border-navy bg-navy text-white" : "border-[#8bb4c0] bg-white text-navy"
      }`}
    >
      <p
        className={`text-[11px] font-medium uppercase tracking-[0.12em] ${
          isRoot ? "text-white/70" : "text-slate-500"
        }`}
      >
        {node.role.area}
      </p>
      <h3 className={`${isRoot ? "text-lg" : "text-sm"} mt-1 font-medium leading-tight`}>
        {node.role.title}
      </h3>
      <p className={`${isRoot ? "text-clay" : "text-sea"} mt-1.5 text-xs font-medium`}>
        {node.role.person}
      </p>
    </div>
  );
}

function SvgOrgChart({
  childrenByParent,
  roots,
}: {
  childrenByParent: Map<string, OrgRole[]>;
  roots: OrgRole[];
}) {
  const chart = buildSvgOrgChart(roots, childrenByParent);

  return (
    <div className="mt-5 rounded-2xl bg-[#f6f8fa] p-3 sm:p-5">
      <svg
        aria-label="Organigrama operativo"
        className="block h-auto w-full"
        role="img"
        style={{ aspectRatio: `${chart.width} / ${chart.height}` }}
        viewBox={`0 0 ${chart.width} ${chart.height}`}
      >
        {chart.lines.map((line, index) => (
          <line
            key={`${line.x1}-${line.y1}-${line.x2}-${line.y2}-${index}`}
            stroke="#7b9ab5"
            strokeWidth="1"
            x1={line.x1}
            x2={line.x2}
            y1={line.y1}
            y2={line.y2}
          />
        ))}
        {chart.nodes.map((node) => (
          <foreignObject
            height={node.height}
            key={roleKey(node.role)}
            width={node.width}
            x={node.x}
            y={node.y}
          >
            <SvgOrgCard node={node} />
          </foreignObject>
        ))}
      </svg>
    </div>
  );
}

function OrgTree({
  childrenByParent,
  role,
}: {
  childrenByParent: Map<string, OrgRole[]>;
  role: OrgRole;
}) {
  const children = childrenByParent.get(roleKey(role)) ?? [];

  return (
    <div className="flex w-full flex-col items-center">
      <OrgNode accent={role.orgParentRoleId ? "sea" : "navy"} role={role} size={role.orgParentRoleId ? "normal" : "large"} />
      {children.length > 0 ? (
        <>
          <div className="hidden h-5 w-px bg-navy/55 lg:block" />
          <div className="relative w-full">
            {children.length > 1 ? (
              <div className="absolute left-[14%] right-[14%] top-0 hidden h-px bg-navy/40 lg:block" />
            ) : null}
            <div
              className="grid w-full gap-x-5 gap-y-4"
              style={{
                gridTemplateColumns: children
                  .map((child) => `minmax(175px, ${getLeafCount(child, childrenByParent)}fr)`)
                  .join(" "),
              }}
            >
              {children.map((child) => (
                <div
                  className="flex min-w-0 flex-col items-center"
                  key={roleKey(child)}
                >
                  <div className="hidden h-3.5 w-px bg-navy/30 lg:block" />
                  <OrgTree childrenByParent={childrenByParent} role={child} />
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function OrgBranch({
  child,
  parent,
}: {
  child?: OrgRole;
  parent: OrgRole;
}) {
  return (
    <div className="relative flex flex-col items-center">
      <div className="hidden h-7 w-px bg-navy/70 lg:block" />
      <OrgNode role={parent} />
      {child ? (
        <>
          <div className="hidden h-9 w-px bg-navy/40 lg:block" />
          <OrgNode accent="sea" role={child} size="small" />
        </>
      ) : null}
    </div>
  );
}

function OrgChart({ roles }: { roles: OrgRole[] }) {
  const hasEditableHierarchy = roles.some((role) => role.orgParentRoleId);

  if (hasEditableHierarchy) {
    const positionedRoles = withFallbackHierarchy(roles);
    const byId = new Map(positionedRoles.map((role) => [roleKey(role), role]));
    const childrenByParent = new Map<string, OrgRole[]>();

    for (const role of positionedRoles) {
      if (!role.orgParentRoleId || !byId.has(role.orgParentRoleId)) continue;
      const children = childrenByParent.get(role.orgParentRoleId) ?? [];
      children.push(role);
      childrenByParent.set(role.orgParentRoleId, children);
    }

    for (const children of childrenByParent.values()) {
      children.sort(compareOrgRoles);
    }

    const roots = positionedRoles
      .filter((role) => !role.orgParentRoleId || !byId.has(role.orgParentRoleId))
      .sort(compareOrgRoles);
    return <SvgOrgChart childrenByParent={childrenByParent} roots={roots} />;
  }

  const general = findRole(roles, ["GG", "Gerente General"]) ?? roles[0];
  const finance = findRole(roles, ["FIN", "Gerente Finanzas", "Finanzas"]);
  const accounting = findRole(roles, ["CONT", "Analista Contable", "Contabilidad"]);
  const tech = findRole(roles, ["TI/C", "TI / Comercial", "Tecnologia / Comercial"]);
  const data = findRole(roles, ["DATOS", "Analista Datos", "Datos"]);
  const operations = findRole(roles, ["OPS", "Jefe Operaciones", "Operaciones"]);
  const service = findRole(roles, ["ATC", "Atencion al Cliente", "Servicio"]);
  const infrastructure = findRole(roles, ["OBRAS", "Obras Civiles", "Infraestructura"]);

  const branches = uniqueRoles([finance, tech, operations, infrastructure]);
  const childrenByBranch = new Map<string, OrgRole | undefined>([
    [finance?.code ?? "", accounting],
    [tech?.code ?? "", data],
    [operations?.code ?? "", service],
    [infrastructure?.code ?? "", undefined],
  ]);
  const used = new Set(uniqueRoles([general, ...branches, accounting, data, service]).map((role) => `${role.code}-${role.title}`));
  const otherRoles = roles.filter((role) => !used.has(`${role.code}-${role.title}`));

  if (!general) {
    return null;
  }

  return (
    <div className="mt-5 rounded-2xl bg-[#f6f8fa] px-3 py-6">
      <div className="mx-auto w-full max-w-6xl">
        <OrgNode accent="navy" role={general} size="large" />
        <div className="mx-auto hidden h-7 w-px bg-navy/70 lg:block" />
        <div className="mx-auto hidden h-px max-w-5xl bg-navy/70 lg:block" />
        <div className="grid gap-3 pt-0 md:grid-cols-2 xl:grid-cols-4">
          {branches.map((role) => (
            <OrgBranch child={childrenByBranch.get(role.code)} key={`${role.code}-${role.title}`} parent={role} />
          ))}
        </div>
        {otherRoles.length > 0 ? (
          <div className="mt-8 border-t border-[#cbd8e3] pt-5">
            <p className="mb-3 text-center text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
              Roles sin ubicacion jerarquica
            </p>
            <div className="grid gap-3 lg:grid-cols-4">
              {otherRoles.map((role) => (
                <OrgNode accent="sea" key={`${role.code}-${role.title}`} role={role} size="small" />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default async function EstructuraPage() {
  const [roleDictionaryResult, roleGovernanceResult] = await Promise.all([
    getRoleDictionary(),
    getRoleGovernanceProcesses(),
  ]);
  const dynamicRoles =
    roleDictionaryResult.data.length > 0 ? roleDictionaryToOrgRoles(roleDictionaryResult.data) : orgRoles;

  return (
    <DashboardShell
      description="Estructura organizacional convertida desde la presentacion a una vista operativa: cargos, procesos transversales y matriz por rol."
      eyebrow="Estructura"
      title="Gobierno operativo McParking"
    >
      <Panel count={`${dynamicRoles.length} cargos`} title="Organigrama operativo">
        {roleDictionaryResult.error ? (
          <div className="mt-5 rounded-lg border border-[#ffd6b0] bg-[#ffe6ca] p-4 text-sm text-[#86510d]">
            {roleDictionaryResult.error.message}
          </div>
        ) : null}
        <OrgChart roles={dynamicRoles} />
      </Panel>

      <Panel count={`${governanceProcesses.length} procesos`} title="Matriz web de procesos por rol">
        {roleGovernanceResult.error ? (
          <div className="mt-5 rounded-lg border border-[#ffd6b0] bg-[#ffe6ca] p-4 text-sm text-[#86510d]">
            Ejecuta la migracion de asignaciones para activar la edicion de esta matriz.
          </div>
        ) : null}
        <StructureExplorer
          assignments={roleGovernanceResult.data}
          processes={governanceProcesses}
          roles={dynamicRoles}
        />
      </Panel>
    </DashboardShell>
  );
}
