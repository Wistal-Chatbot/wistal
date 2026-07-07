import { redirect } from "next/navigation";

// The report detail route runs the report; send users to the run screen.
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/app/reports/${id}/run`);
}
