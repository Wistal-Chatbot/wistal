import { EmptyPage } from "../../_components/EmptyPage";

export default function Page() {
  return (
    <EmptyPage
      eyebrow="Raporty AI"
      title="Puste szczegóły raportu"
      description="Miejsce na opis raportu, wymagane parametry, tabele źródłowe i przycisk przejścia do uruchomienia."
      items={["Opis raportu", "Parametry wejściowe", "Tabele", "Uruchom raport"]}
    />
  );
}
