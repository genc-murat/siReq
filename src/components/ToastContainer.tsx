import { useToastStore } from "@/stores/toastStore";
import { cn } from "@/lib/utils";

const typeStyles = {
  success: "bg-green-600 text-white",
  error: "bg-destructive text-destructive-foreground",
  info: "bg-primary text-primary-foreground",
};

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          onClick={() => removeToast(toast.id)}
          className={cn(
            "px-4 py-2 rounded-md text-sm font-medium shadow-lg cursor-pointer animate-in fade-in slide-in-from-bottom-2",
            typeStyles[toast.type]
          )}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
