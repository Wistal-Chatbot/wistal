import { EmptyPage } from "../../_components/EmptyPage";

export default function Page() {
  return (
    <EmptyPage
      eyebrow="Chatbot"
      title="Pusta strona aktywnej sesji"
      description="Dynamiczny widok rozmowy. Docelowo pobierze sesję, wiadomości, stan web-search oraz metadane zapytań SQL."
      items={["/api/chat/sessions/:sessionId", "Pokaż zapytanie SQL", "Komentarz do odpowiedzi"]}
    />
  );
}
