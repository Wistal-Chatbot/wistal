import { EmptyPage } from "../_components/EmptyPage";

export default function Page() {
  return (
    <EmptyPage
      eyebrow="Admin"
      title="Pusty przegląd administracyjny"
      description="Miejsce na statystyki użytkowników, rozmów, zapytań SQL oraz kartę wykorzystania AI."
      items={["Użytkownicy", "Rozmowy", "Zapytania SQL", "AI usage"]}
    />
  );
}
