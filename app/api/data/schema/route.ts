import { getCurrentUser } from "@/lib/auth/current-user";
import { getDataBrowserSchema } from "@/lib/data-browser/schema";

/** GET — table + column config for the manual data browser (Dane). Any signed-in
 * user; runs no ERP query, so nothing to audit. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Brak autoryzacji." }, { status: 401 });
  }

  const schema = await getDataBrowserSchema();
  return Response.json(schema);
}
