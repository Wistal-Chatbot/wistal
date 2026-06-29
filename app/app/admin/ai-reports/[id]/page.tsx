import { redirect } from "next/navigation";

// The report editor screen is not part of the current design handoff yet;
// send users back to the reports management list.
export default function Page() {
  redirect("/app/admin/ai-reports");
}
