import { EmptyPage } from "../../_components/EmptyPage";

export default function Page() {
  return (
    <EmptyPage
      eyebrow="Admin · Raporty AI"
      title="Puste zarządzanie raportami AI"
      description="Miejsce na listę skonfigurowanych raportów, generator z opisu, edycję konfiguracji i aktywację raportów."
      items={["Lista raportów", "Generator AI", "Status aktywności", "Edycja"]}
    />
  );
}
