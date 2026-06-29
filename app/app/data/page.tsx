import { EmptyPage } from "../_components/EmptyPage";

export default function Page() {
  return (
    <EmptyPage
      eyebrow="Dane"
      title="Pusty browser danych ERP"
      description="Miejsce na wybór tabeli, globalne wyszukiwanie, filtry, sortowanie, tabelę danych i panel szczegółów rekordu."
      items={["Tabela: Towary", "Szukaj w tabeli", "Filtry", "Załaduj więcej"]}
    />
  );
}
