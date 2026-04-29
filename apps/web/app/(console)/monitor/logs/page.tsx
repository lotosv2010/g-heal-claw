import { PlaceholderPage } from "@/components/dashboard/placeholder-page";
import { findNav } from "@/lib/nav";

export default function Page() {
  const nav = findNav("monitor/logs")!;
  return <PlaceholderPage title={nav.label} phase={nav.placeholder ?? ""} />;
}
