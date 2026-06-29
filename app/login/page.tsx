import { allowNonWistalEmails } from "@/lib/auth/domain";

import { LoginPage } from "./LoginPage";

export default function Page() {
  return <LoginPage allowNonWistalEmails={allowNonWistalEmails()} />;
}
