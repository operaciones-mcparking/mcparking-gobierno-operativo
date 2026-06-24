export type OrgRole = {
  id?: string;
  code: string;
  title: string;
  person: string;
  area: string;
  level: "Direccion" | "Gestion" | "Ejecucion";
  objective: string;
  responsibilities: string[];
  sortOrder?: number | null;
  orgColumn?: number | null;
  orgParentRoleId?: string | null;
  orgRow?: number | null;
};

export type GovernanceProcess = {
  name: string;
  area: "Operacion" | "Finanzas" | "Comercial" | "Personas" | "Infraestructura" | "Tecnologia" | "Control";
  description: string;
  roles: string[];
};

export const orgSummary = {
  roleCount: 8,
  processCount: 7,
  governanceAxes: 4,
  insights: [
    "Gerencia General participa en todos los procesos.",
    "Finanzas y TI / Comercial concentran control y crecimiento.",
    "Datos conecta BI, pricing, demanda y automatizacion.",
    "Operaciones, Atencion e Infraestructura aseguran ejecucion.",
  ],
};

export const orgRoles: OrgRole[] = [
  {
    area: "Direccion",
    code: "GG",
    level: "Direccion",
    objective:
      "Dirigir estrategica y operacionalmente McParking, asegurando crecimiento, rentabilidad y coordinacion entre areas.",
    person: "German Bravo",
    responsibilities: [
      "Estrategia comercial y operacional.",
      "Inversiones, proyectos y nuevas lineas de negocio.",
      "Objetivos financieros, ocupacion, revenue y rentabilidad.",
      "Relacion con clientes corporativos, bancos y aliados.",
      "Politicas comerciales, descuentos, convenios y cumplimiento contractual.",
    ],
    title: "Gerente General",
  },
  {
    area: "Finanzas",
    code: "FIN",
    level: "Gestion",
    objective:
      "Administrar recursos financieros, controlando ingresos, gastos, flujo de caja y cumplimiento tributario.",
    person: "Hernan Venegas",
    responsibilities: [
      "Presupuestos y proyecciones financieras.",
      "Flujo de caja y liquidez.",
      "Conciliaciones bancarias, cierres contables y estados financieros.",
      "Pagos a proveedores, cobranza y facturacion.",
      "Rentabilidad de proyectos y relacion con bancos.",
    ],
    title: "Gerente Finanzas",
  },
  {
    area: "Tecnologia / Comercial",
    code: "TI/C",
    level: "Gestion",
    objective:
      "Liderar tecnologia, desarrollo comercial y transformacion digital para que los sistemas apoyen el crecimiento del negocio.",
    person: "Jose Luis",
    responsibilities: [
      "Plataformas tecnologicas y sistemas internos.",
      "Integraciones con Odoo, pagos y sistemas externos.",
      "Proveedores tecnologicos e infraestructura.",
      "Alianzas, convenios y propuestas comerciales.",
      "Automatizacion, IA, dashboards y arquitectura tecnologica.",
    ],
    title: "TI / Comercial",
  },
  {
    area: "Contabilidad",
    code: "CONT",
    level: "Ejecucion",
    objective:
      "Ejecutar y controlar procesos contables y tributarios, asegurando calidad y consistencia financiera.",
    person: "Romario Larenas",
    responsibilities: [
      "Registro y control contable.",
      "Conciliaciones bancarias.",
      "Analisis de cuentas y cierres mensuales.",
      "Informacion tributaria y control documental.",
      "Apoyo en auditorias y coordinacion con gerencia financiera.",
    ],
    title: "Analista Contable",
  },
  {
    area: "Datos",
    code: "DATOS",
    level: "Ejecucion",
    objective:
      "Transformar datos operacionales y comerciales en informacion util para la toma de decisiones.",
    person: "Agustin",
    responsibilities: [
      "Dashboards de gestion, ocupacion, revenue y demanda.",
      "Reportes para gerencia y analisis de clientes.",
      "Bases de datos corporativas y modelos de informacion.",
      "Calidad e integridad de datos.",
      "Automatizaciones, alertas, IA, pricing y competencia.",
    ],
    title: "Analista Datos TI",
  },
  {
    area: "Operaciones",
    code: "OPS",
    level: "Ejecucion",
    objective:
      "Planificar, coordinar y supervisar la operacion diaria de estacionamientos y experiencia de servicio.",
    person: "Diego Vera + equipo",
    responsibilities: [
      "Operacion diaria y personal operativo.",
      "Ocupacion, disponibilidad e incidencias.",
      "Servicios de transporte.",
      "Mejoras operativas y protocolos de servicio.",
      "Indicadores operacionales.",
    ],
    title: "Jefe Operaciones",
  },
  {
    area: "Servicio",
    code: "ATC",
    level: "Ejecucion",
    objective:
      "Entregar atencion cercana, eficiente y oportuna a clientes, resolviendo consultas y apoyando la prestacion del servicio.",
    person: "Equipo Operativo",
    responsibilities: [
      "Atencion presencial y digital.",
      "Reclamos y solicitudes.",
      "Apoyo en check-in y check-out.",
      "Apoyo en reservas y modificaciones.",
      "Registro de incidencias.",
    ],
    title: "Atencion al Cliente",
  },
  {
    area: "Infraestructura",
    code: "OBRAS",
    level: "Ejecucion",
    objective:
      "Planificar y supervisar obras civiles, mantenciones e infraestructura fisica para continuidad operacional.",
    person: "Nicolas Valdes",
    responsibilities: [
      "Obras y proyectos de infraestructura.",
      "Contratistas y proveedores.",
      "Mantenciones preventivas y correctivas.",
      "Presupuestos de obras.",
      "Seguridad, mejoras y expansion de espacios.",
    ],
    title: "Obras Civiles",
  },
];

export const governanceProcesses: GovernanceProcess[] = [
  {
    area: "Operacion",
    description: "Ejecucion diaria del servicio, disponibilidad, incidencias y continuidad operativa.",
    name: "Core Operaciones",
    roles: ["GG", "TI/C", "OPS", "ATC"],
  },
  {
    area: "Finanzas",
    description: "Presupuesto, caja, facturacion, cobranza, cierres y evaluacion financiera.",
    name: "Finanzas",
    roles: ["GG", "FIN", "CONT"],
  },
  {
    area: "Comercial",
    description: "Crecimiento, revenue, precios, convenios, demanda y oportunidades comerciales.",
    name: "Marketing",
    roles: ["GG", "TI/C", "DATOS"],
  },
  {
    area: "Personas",
    description: "Coordinacion interna, responsabilidades y soporte para la operacion del equipo.",
    name: "RR.HH.",
    roles: ["GG", "FIN", "CONT"],
  },
  {
    area: "Infraestructura",
    description: "Implementaciones, mantenciones, habilitaciones y continuidad fisica del servicio.",
    name: "Implementacion / Mantencion",
    roles: ["GG", "OPS", "OBRAS"],
  },
  {
    area: "Tecnologia",
    description: "Sistemas, integraciones, datos, automatizaciones y plataformas de operacion.",
    name: "TI",
    roles: ["GG", "TI/C", "CONT", "DATOS"],
  },
  {
    area: "Control",
    description: "KPIs, revenue management, ocupacion, pricing, forecast, presupuesto e iniciativas.",
    name: "Planificacion / Control",
    roles: ["GG", "FIN", "TI/C", "DATOS"],
  },
];

export const roleCodeLabels = orgRoles.reduce<Record<string, string>>((labels, role) => {
  labels[role.code] = role.title;
  return labels;
}, {});
