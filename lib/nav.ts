// The rail. Every page of Mav in one place: label, icon, and what the page tells you.
import type { NavGroup } from "@metis/ui";

export const NAV_GROUPS: NavGroup[] = [
  { label: "", items: [
    { key: "dashboard", label: "Overview", icon: "home", hint: "Where every IT asset stands today" },
  ] },
  { label: "Assets", items: [
    { key: "assets", label: "Assets", icon: "boxes", hint: "Every laptop, desktop and device we own" },
    { key: "categories", label: "Categories", icon: "tags", hint: "Kinds of assets and their sub-kinds" },
    { key: "assignments", label: "Assignments", icon: "swap", hint: "Who has what" },
  ] },
  { label: "People & places", items: [
    { key: "employees", label: "Employees", icon: "users", hint: "People who use assets" },
    { key: "departments", label: "Departments", icon: "briefcase", hint: "Where people work" },
  ] },
];

/** Page title + one line of what it tells you (used by PageHeader). */
export const PAGE_INFO: Record<string, { title: string; description: string }> = Object.fromEntries(
  NAV_GROUPS.flatMap((g) => g.items).map((i) => [i.key, { title: i.label, description: i.hint ?? "" }]),
);