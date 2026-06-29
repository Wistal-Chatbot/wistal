import { ChatView } from "./ChatView";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ prompt?: string }>;
}) {
  const { prompt } = await searchParams;
  return <ChatView initialPrompt={prompt ?? ""} />;
}
