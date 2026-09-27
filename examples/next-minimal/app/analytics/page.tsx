import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Dashboard } from "@konsfyi/analytics/dashboard";
import "@konsfyi/analytics/dashboard.css";
import { analytics } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const asked = await searchParams;
  const head = await headers();
  const token = typeof asked.token === "string" ? asked.token : null;
  if (!analytics.mayRead((name) => head.get(name), token)) notFound();

  return (
    <Dashboard
      initial={await analytics.numbers(analytics.windowOf(asked))}
      backend={analytics.backend()}
    />
  );
}
