import type { ProcessCatalogItem } from "@/lib/dashboard/data";

export const processMapCopy = {
  input: {
    description: "Reserva, precio, disponibilidad, seguridad, traslado y soporte.",
    title: "Necesidades del servicio",
  },
  subtitle: "Vista macro del servicio McParking: necesidades, operación y resultado esperado.",
  title: "Mapa de procesos",
  output: {
    description:
      "Cliente con reserva confirmada, vehículo resguardado, traslado oportuno y servicio confiable.",
    title: "Resultado del servicio",
  },
};

export const processMapGroups: Array<{
  description: string;
  label: string;
  tone: "info" | "success" | "warning";
  value: ProcessCatalogItem["process_type"];
}> = [
  {
    description: "Precios, capacidad, estrategia comercial y prioridades operativas.",
    label: "Estratégicos",
    tone: "info",
    value: "strategic",
  },
  {
    description: "Reserva, ingreso, custodia del vehículo, traslados y cierre de atención.",
    label: "Operativos / Clave",
    tone: "success",
    value: "operational",
  },
  {
    description: "Administración, finanzas, sistemas, infraestructura, personas y proveedores.",
    label: "Soporte",
    tone: "warning",
    value: "support",
  },
];
