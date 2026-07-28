import { ReportRunner } from "../../ReportRunner";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ReportRunner key={id} reportId={id} />;
}
