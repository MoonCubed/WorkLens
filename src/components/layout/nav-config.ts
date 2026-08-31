import {
  LayoutDashboard,
  Users,
  Inbox,
  FlaskConical,
  Repeat2,
  Briefcase,
  Award,
  CalendarRange,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const SUPERVISOR_NAV: NavItem[] = [
  { label: "Dashboard", href: "/supervisor", icon: LayoutDashboard },
  { label: "Team Capacity", href: "/supervisor/team-capacity", icon: Users },
  { label: "Calendar", href: "/supervisor/calendar", icon: CalendarRange },
  { label: "Tasks", href: "/supervisor/work", icon: Inbox },
  { label: "Skills", href: "/supervisor/skills", icon: Wrench },
  { label: "What-If", href: "/supervisor/what-if", icon: FlaskConical },
  { label: "Handover", href: "/supervisor/handover", icon: Repeat2 },
];

export const EMPLOYEE_NAV: NavItem[] = [
  { label: "My Dashboard", href: "/employee", icon: LayoutDashboard },
  { label: "My Work", href: "/employee/work", icon: Briefcase },
  { label: "My Calendar", href: "/employee/calendar", icon: CalendarRange },
  { label: "My Skills", href: "/employee/skills", icon: Award },
  { label: "Handover Requests", href: "/employee/handover-requests", icon: Repeat2 },
];
