import { EmployeeSessionProvider } from "@/store/session-store";
import { EmployeeAppShell } from "@/components/layout/EmployeeAppShell";

export default function EmployeeLayout({ children }: LayoutProps<"/employee">) {
  return (
    <EmployeeSessionProvider>
      <EmployeeAppShell>{children}</EmployeeAppShell>
    </EmployeeSessionProvider>
  );
}
