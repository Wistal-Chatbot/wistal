import { redirect } from "next/navigation";

import { allowNonWistalEmails } from "@/lib/auth/domain";
import { getSessionPayload } from "@/lib/auth/session";

import { LoginPage } from "./LoginPage";

export default async function Page() {
  // Already signed in? Skip the login form and go straight to the app.
  const session = await getSessionPayload();
  if (session) {
    redirect("/app/chat");
  }

  return <LoginPage allowNonWistalEmails={allowNonWistalEmails()} />;
}
