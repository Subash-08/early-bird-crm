import { CrmApp } from "@/components/crm-app";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let customerId = id;
  try {
    customerId = decodeURIComponent(id);
  } catch {
    // Invalid percent escapes remain unchanged and safely produce a 404.
  }
  return <CrmApp initialView="customers" customerId={customerId} />;
}
