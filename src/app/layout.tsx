import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { EmployeesProvider } from "@/store/employees-store";
import { TicketsProvider } from "@/store/tickets-store";
import { WorkLogProvider } from "@/store/work-log-store";
import { HandoverRequestsProvider } from "@/store/handover-requests-store";
import { CalendarEventsProvider } from "@/store/calendar-events-store";
import { SkillsProvider } from "@/store/skills-store";
import { TaskAdjustmentsProvider } from "@/store/task-adjustments-store";
import { SkillChangeRequestsProvider } from "@/store/skill-change-requests-store";
import { RootDataGate } from "@/components/layout/RootDataGate";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WorkLens | All tasks in sight.",
  description:
    "WorkLens connects HR and IT-Demand to answer: who is available, who has the right skills, and what happens if we assign new work.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased scroll-smooth`}>
      <body className="min-h-full flex flex-col bg-page text-ink">
        <EmployeesProvider>
          <TicketsProvider>
            <WorkLogProvider>
              <HandoverRequestsProvider>
                <CalendarEventsProvider>
                  <SkillsProvider>
                    <TaskAdjustmentsProvider>
                      <SkillChangeRequestsProvider>
                        <RootDataGate>{children}</RootDataGate>
                      </SkillChangeRequestsProvider>
                    </TaskAdjustmentsProvider>
                  </SkillsProvider>
                </CalendarEventsProvider>
              </HandoverRequestsProvider>
            </WorkLogProvider>
          </TicketsProvider>
        </EmployeesProvider>
      </body>
    </html>
  );
}
