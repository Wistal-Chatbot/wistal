import { redirect } from "next/navigation";

// Bare /app has no screen of its own — forward to the main chat view.
export default function Page() {
  redirect("/app/chat");
}
