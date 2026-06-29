import { redirect } from "next/navigation";
import { getSessionPayload } from "@/lib/auth/session";

export default async function Home() {
  const session = await getSessionPayload();
  redirect(session ? "/app/chat" : "/login");
}
