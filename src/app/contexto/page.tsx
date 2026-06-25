import { ContextStart } from "@/app/contexto/context-start";
import { getOperationalContextOptions } from "@/lib/dashboard/data";

export default async function ContextPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const contextOptions = await getOperationalContextOptions();

  return (
    <ContextStart
      countries={contextOptions.countries}
      nextPath={params.next ?? "/estructura"}
      sites={contextOptions.sites}
    />
  );
}
