import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Red de Roles, Procesos, Áreas y Responsables",
  description: "MVP para mapear procesos, roles funcionales y personas asignadas.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
