import { redirect } from "next/navigation";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ country_id?: string; site_id?: string }>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();

  if (params.country_id) {
    query.set("country_id", params.country_id);
  }

  if (params.site_id) {
    query.set("site_id", params.site_id);
  }

  const nextQuery = query.toString();
  redirect(nextQuery ? `/estructura?${nextQuery}` : "/estructura");
}
