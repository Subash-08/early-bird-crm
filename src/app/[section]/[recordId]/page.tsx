import { notFound } from "next/navigation";
import { CrmApp } from "@/components/crm-app";
import { isRecordWorkspace } from "@/lib/workspace-access";

export default async function WorkspaceRecordPage({ params }: { params: Promise<{ section: string; recordId: string }> }) {
  const { section, recordId } = await params;
  if (!isRecordWorkspace(section) || !recordId || recordId.length > 160) notFound();
  return <CrmApp initialView={section} />;
}
