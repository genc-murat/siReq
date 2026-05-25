import type { FormField } from "@/lib/invoke";
import { cn } from "@/lib/utils";
import { useRef } from "react";

interface FormFieldEditorProps {
  fields: FormField[];
  onChange: (fields: FormField[]) => void;
}

export function FormFieldEditor({ fields, onChange }: FormFieldEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeFileIndexRef = useRef<number>(-1);

  const updateField = (index: number, partial: Partial<FormField>) => {
    const next = [...fields];
    next[index] = { ...next[index], ...partial };
    onChange(next);
  };

  const removeField = (index: number) => {
    onChange(fields.filter((_, i) => i !== index));
  };

  const addText = () => {
    onChange([
      ...fields,
      { key: "", value: "", field_type: "text", enabled: true },
    ]);
  };

  const addFile = () => {
    onChange([
      ...fields,
      { key: "", value: "", file_path: null, file_name: null, file_data: null, content_type: null, field_type: "file", enabled: true },
    ]);
  };

  const handleFilePick = (index: number) => {
    activeFileIndexRef.current = index;
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const index = activeFileIndexRef.current;
    if (file && index >= 0 && index < fields.length) {
      const ct = file.type || "application/octet-stream";
      updateField(index, {
        value: file.name,
        file_name: file.name,
        file_path: null,
        content_type: ct,
      });

      // Read the file as base64
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // result is a data URL like "data:image/png;base64,iVBOR..."
        const base64 = result.split(",")[1] || result;
        updateField(index, { file_data: base64 });
      };
      reader.readAsDataURL(file);
    }
    // Reset so same file can be selected again
    e.target.value = "";
  };

  return (
    <div className="flex flex-col h-full gap-2">
      {fields.length === 0 && (
        <div className="text-xs text-muted-foreground text-center py-6">
          No form fields yet. Add text or file fields below.
        </div>
      )}
      <div className="flex-1 overflow-y-auto space-y-1">
        {fields.map((field, i) => (
          <div
            key={i}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-lg group hover:bg-secondary/50 transition-all duration-150",
              !field.enabled && "opacity-50"
            )}
          >
            {/* Type badge */}
            <span className={cn(
              "text-[10px] font-medium uppercase px-1 py-0.5 rounded-lg shrink-0",
              field.field_type === "file"
                ? "bg-blue-500/20 text-blue-400"
                : "bg-green-500/20 text-green-400"
            )}>
              {field.field_type === "file" ? "FILE" : "TEXT"}
            </span>

            {/* Key input */}
            <input
              className="flex-1 min-w-[100px] bg-transparent border-b border-transparent hover:border-border focus:border-primary outline-none text-xs py-0.5 px-1"
              placeholder="Key"
              value={field.key}
              onChange={(e) => updateField(i, { key: e.target.value })}
            />

            {/* Separator */}
            <span className="text-muted-foreground text-xs shrink-0">:</span>

            {/* Value input */}
            {field.field_type === "file" ? (
              <div className="flex-1 flex items-center gap-1">
                <input
                  className="flex-1 min-w-[80px] bg-transparent border-b border-transparent text-xs py-0.5 px-1 text-muted-foreground"
                  placeholder="Click to pick file..."
                  value={field.file_name || field.value}
                  readOnly
                />
                <button
                  onClick={() => handleFilePick(i)}
                  className="text-[10px] px-2 py-0.5 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 shrink-0 transition-all duration-150"
                >
                  Browse
                </button>
              </div>
            ) : (
              <input
                className="flex-1 min-w-[100px] bg-transparent border-b border-transparent hover:border-border focus:border-primary outline-none text-xs py-0.5 px-1"
                placeholder="Value"
                value={field.value}
                onChange={(e) => updateField(i, { value: e.target.value })}
              />
            )}

            {/* Toggle */}
            <button
              onClick={() => updateField(i, { enabled: !field.enabled })}
              className={cn(
                "shrink-0 w-5 h-5 flex items-center justify-center rounded-lg text-[10px] transition-all duration-150",
                field.enabled
                  ? "text-green-500 hover:text-green-400"
                  : "text-muted-foreground hover:text-foreground"
              )}
              title={field.enabled ? "Disable" : "Enable"}
            >
              {field.enabled ? "✓" : "✗"}
            </button>

            {/* Delete */}
            <button
              onClick={() => removeField(i)}
              className="shrink-0 w-5 h-5 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-150"
              title="Remove"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Add buttons */}
      <div className="flex gap-2 shrink-0">
        <button
          onClick={addText}
          className="flex-1 text-xs px-3 py-1.5 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-all duration-150"
        >
          + Text Field
        </button>
        <button
          onClick={addFile}
          className="flex-1 text-xs px-3 py-1.5 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-all duration-150"
        >
          + File Field
        </button>
      </div>
    </div>
  );
}
