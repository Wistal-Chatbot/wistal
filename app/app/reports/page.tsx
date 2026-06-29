import { EmptyPage } from "../_components/EmptyPage";

export default function Page() {
  return (
    <EmptyPage
      eyebrow="Raporty AI"
      title="Pusta lista raportów"
      description="Miejsce na karty aktywnych raportów AI, ostatnie uruchomienia i przejście do formularza uruchomienia raportu."
      items={["Audyt klienta", "Analiza rotacji zapasów", "Przeterminowane należności"]}
    />
  );
}
