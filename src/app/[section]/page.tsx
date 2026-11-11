import { notFound } from "next/navigation";
import { CrmApp, type View } from "@/components/crm-app";

const sections: View[] = [
  "dashboard", "enquiries", "customers", "quotations", "bookings",
  "operations", "settlements", "tasks", "notifications", "reports",
  "imports", "invoice-settings", "staff", "attendance",
];

export function generateStaticParams() {
  return sections.map((section) => ({ section }));
}

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!sections.includes(section as View)) notFound();
  return <CrmApp initialView={section as View} />;
}
