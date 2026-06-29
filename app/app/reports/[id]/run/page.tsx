import { EmptyPage } from "../../../_components/EmptyPage";

export default function Page() {
  return (
    <EmptyPage
      eyebrow="Raporty AI"
      title="Puste uruchomienie raportu"
      description="Miejsce na formularz parametrów, stan generowania i wynik jako pełny widget HTML z metadanymi oraz komentarzem."
      items={["Formularz parametrów", "Generowanie raportu", "Widget HTML", "Uruchom ponownie"]}
    />
  );
}
