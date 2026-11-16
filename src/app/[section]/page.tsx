import { notFound } from "next/navigation";
import { CrmApp } from "@/components/crm-app";
import { workspaceViews, type View } from "@/lib/workspace-access";

export function generateStaticParams() {
  return workspaceViews.map((section) => ({ section }));
}

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!workspaceViews.includes(section as View)) notFound();
  return <CrmApp initialView={section as View} />;
}
