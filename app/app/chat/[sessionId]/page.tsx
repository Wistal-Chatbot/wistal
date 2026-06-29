import { ChatView } from "../ChatView";

export default async function Page({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <ChatView sessionId={sessionId} />;
}
