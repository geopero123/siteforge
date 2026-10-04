import { AuditView } from "@/components/audit-view";
export default async function Audit({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AuditView id={id} />;
}
