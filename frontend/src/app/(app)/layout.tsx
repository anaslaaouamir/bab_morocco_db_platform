import AppShell from "@/components/nav/AppShell";
import ForcePasswordGuard from "@/components/auth/ForcePasswordGuard";

export default function AppGroupLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <AppShell>
      <ForcePasswordGuard>{children}</ForcePasswordGuard>
    </AppShell>
  );
}
