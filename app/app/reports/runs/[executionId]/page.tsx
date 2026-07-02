import { ReportExecutionView } from "../../ReportExecutionView";

export default async function Page({
  params,
}: {
  params: Promise<{ executionId: string }>;
}) {
  const { executionId } = await params;
  return <ReportExecutionView executionId={executionId} />;
}
