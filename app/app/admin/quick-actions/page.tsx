import { EmptyPage } from "../../_components/EmptyPage";

export default function Page() {
  return (
    <EmptyPage
      eyebrow="Admin · Szybkie akcje"
      title="Puste zarządzanie Szybkimi akcjami"
      description="Miejsce na ręcznie zarządzane akcje widoczne inline w konwersacji, ich prompt, input i status aktywności."
      items={["Lista akcji", "Szablon promptu", "Pole wejścia", "Status"]}
    />
  );
}
