import { PlaceholderPage } from "@/components/dashboard/placeholder-page";
import { findNav } from "@/lib/nav";

export default function Page() {
  const nav = findNav("settings/tokens")!;
  return <PlaceholderPage title={nav.label} phase={nav.placeholder ?? ""} />;
}
