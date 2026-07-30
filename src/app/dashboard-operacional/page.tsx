import { redirect } from "next/navigation";

export default function DashboardOperacionalPage() {
  redirect("/orquestador?view=dashboard");
}