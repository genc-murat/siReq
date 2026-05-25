import { useRequestStore } from "@/stores/requestStore";
import type { BodyType } from "@/lib/invoke";
import { CodeMirrorEditor } from "@/components/CodeMirrorEditor";
import { FormFieldEditor } from "@/components/Request/FormFieldEditor";
import { cn } from "@/lib/utils";

const bodyTypes: { value: BodyType; label: string }[] = [
  { value: "none", label: "None" },
  { value: "json", label: "JSON" },
  { value: "xml", label: "XML" },
  { value: "text", label: "Text" },
  { value: "form", label: "Form Data" },
  { value: "form_urlencoded", label: "Form URL Encoded" },
];

export function BodyTab() {
  const bodyType = useRequestStore((s) => s.request.body_type);
  const body = useRequestStore((s) => s.request.body);
  const formFields = useRequestStore((s) => s.request.form_fields);
  const setBodyType = useRequestStore((s) => s.setBodyType);
  const setBody = useRequestStore((s) => s.setBody);
  const setFormFields = useRequestStore((s) => s.setFormFields);

  return (
    <div className="flex flex-col h-full gap-2">
      <div className="flex gap-1 shrink-0">
        {bodyTypes.map((bt) => (
          <button
            key={bt.value}
            onClick={() => setBodyType(bt.value)}
            className={cn(
              "px-2 py-0.5 text-xs rounded-lg transition-all duration-150",
              bodyType === bt.value
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            )}
          >
            {bt.label}
          </button>
        ))}
      </div>
      {bodyType === "form" ? (
        <div className="flex-1 min-h-0">
          <FormFieldEditor fields={formFields} onChange={setFormFields} />
        </div>
      ) : bodyType !== "none" ? (
        <div className="flex-1 min-h-0 border rounded-lg overflow-hidden">
          <CodeMirrorEditor
            value={body}
            onChange={setBody}
            language={bodyType === "json" ? "json" : bodyType === "xml" ? "xml" : "text"}
          />
        </div>
      ) : null}
    </div>
  );
}
