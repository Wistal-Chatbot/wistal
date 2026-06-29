import { EmptyPage } from "../../../_components/EmptyPage";

export default function Page() {
  return (
    <EmptyPage
      eyebrow="Admin · Raporty AI"
      title="Pusta edycja raportu AI"
      description="Miejsce na edycję promptu, output_schema, html_widget, input_params, model_config i statusu aktywności."
      items={["System prompt", "Output schema", "HTML widget", "Model config"]}
    />
  );
}
