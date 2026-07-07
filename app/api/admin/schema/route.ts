import { requireAdmin } from "@/lib/auth/require-admin";
import { getPublicSchema } from "@/lib/sql/introspection";

/** GET — public (ERP) tables with their columns and primary key, for the admin
 * quick-action builder. Admin-only. */
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const tables = await getPublicSchema();
  return Response.json({ tables });
}
