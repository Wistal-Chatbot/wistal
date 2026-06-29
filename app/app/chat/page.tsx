import { EmptyPage } from "../_components/EmptyPage";

export default function Page() {
  return (
    <EmptyPage
      eyebrow="Chatbot"
      title="Pusta strona rozmowy"
      description="Miejsce na historię konwersacji, odpowiedzi AI, Szybkie akcje inline, przełącznik wyszukiwania w internecie i pole pytania o dane ERP."
      items={["Historia rozmów", "Szybkie akcje", "Input chatbota", "Feedback"]}
    />
  );
}
