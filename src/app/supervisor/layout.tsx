import { SupervisorSessionProvider } from "@/store/session-store";
import { SupervisorAppShell } from "@/components/layout/SupervisorAppShell";

export default function SupervisorLayout({ children }: LayoutProps<"/supervisor">) {
  return (
    <SupervisorSessionProvider>
      <SupervisorAppShell>{children}</SupervisorAppShell>
    </SupervisorSessionProvider>
  );
}
