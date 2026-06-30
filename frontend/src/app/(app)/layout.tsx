import AppShell from "@/components/nav/AppShell";

/**
 * Layout for all authenticated app routes (dashboard, prospection, outreach,
 * negociation, contrats, settings). Applies the Navigation Rail/Bar shell.
 * `/login` lives outside this route group and does not get AppShell.
 */
export default function AppGroupLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <AppShell>{children}</AppShell>;
}
