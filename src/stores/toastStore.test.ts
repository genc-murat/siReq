import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { useToastStore } from "./toastStore";

function resetStore() {
  useToastStore.setState({ toasts: [] });
}

describe("toastStore", () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Initial state ────────────────────────────────────────────────────

  describe("initial state", () => {
    it("starts with an empty toasts array", () => {
      expect(useToastStore.getState().toasts).toEqual([]);
    });
  });

  // ── addToast ─────────────────────────────────────────────────────────

  describe("addToast", () => {
    it("adds a toast with message and default type 'info'", () => {
      useToastStore.getState().addToast("Hello");

      const toasts = useToastStore.getState().toasts;
      expect(toasts).toHaveLength(1);
      expect(toasts[0].message).toBe("Hello");
      expect(toasts[0].type).toBe("info");
      expect(toasts[0].id).toBeTruthy();
    });

    it("adds a toast with success type", () => {
      useToastStore.getState().addToast("Saved!", "success");

      const toasts = useToastStore.getState().toasts;
      expect(toasts).toHaveLength(1);
      expect(toasts[0].message).toBe("Saved!");
      expect(toasts[0].type).toBe("success");
    });

    it("adds a toast with error type", () => {
      useToastStore.getState().addToast("Failed!", "error");

      const toasts = useToastStore.getState().toasts;
      expect(toasts).toHaveLength(1);
      expect(toasts[0].message).toBe("Failed!");
      expect(toasts[0].type).toBe("error");
    });

    it("appends multiple toasts in order", () => {
      useToastStore.getState().addToast("First", "info");
      useToastStore.getState().addToast("Second", "success");
      useToastStore.getState().addToast("Third", "error");

      const toasts = useToastStore.getState().toasts;
      expect(toasts).toHaveLength(3);
      expect(toasts[0].message).toBe("First");
      expect(toasts[1].message).toBe("Second");
      expect(toasts[2].message).toBe("Third");
    });

    it("generates unique id per toast", () => {
      useToastStore.getState().addToast("A");
      useToastStore.getState().addToast("B");

      const toasts = useToastStore.getState().toasts;
      expect(toasts[0].id).not.toBe(toasts[1].id);
    });

    it("auto-dismisses toast after 3000ms", async () => {
      vi.useFakeTimers();

      useToastStore.getState().addToast("Auto dismiss", "info");
      expect(useToastStore.getState().toasts).toHaveLength(1);

      // Advance time by 2999ms — toast should still be there
      vi.advanceTimersByTime(2999);
      expect(useToastStore.getState().toasts).toHaveLength(1);

      // Advance past 3000ms — toast should be removed
      vi.advanceTimersByTime(1);
      expect(useToastStore.getState().toasts).toHaveLength(0);
    });

    it("auto-dismisses each toast independently", () => {
      vi.useFakeTimers();

      useToastStore.getState().addToast("First", "info");

      vi.advanceTimersByTime(1000);

      useToastStore.getState().addToast("Second", "info");

      // 2000ms after first toast = only first should auto-dismiss
      vi.advanceTimersByTime(2000);
      const afterFirstDismiss = useToastStore.getState().toasts;
      expect(afterFirstDismiss).toHaveLength(1);
      expect(afterFirstDismiss[0].message).toBe("Second");

      // 3000ms after second toast = second should also dismiss
      vi.advanceTimersByTime(1000);
      expect(useToastStore.getState().toasts).toHaveLength(0);
    });
  });

  // ── removeToast ──────────────────────────────────────────────────────

  describe("removeToast", () => {
    it("removes a toast by id", () => {
      useToastStore.getState().addToast("To remove", "info");
      const id = useToastStore.getState().toasts[0].id;

      useToastStore.getState().removeToast(id);

      expect(useToastStore.getState().toasts).toEqual([]);
    });

    it("removes only the specified toast", () => {
      useToastStore.getState().addToast("Keep", "info");
      const keepId = useToastStore.getState().toasts[0].id;

      useToastStore.getState().addToast("Remove", "error");
      const removeId = useToastStore.getState().toasts[1].id;

      useToastStore.getState().removeToast(removeId);

      const toasts = useToastStore.getState().toasts;
      expect(toasts).toHaveLength(1);
      expect(toasts[0].id).toBe(keepId);
      expect(toasts[0].message).toBe("Keep");
    });

    it("does nothing when id does not exist", () => {
      useToastStore.getState().addToast("Test", "info");
      const before = useToastStore.getState().toasts.length;

      useToastStore.getState().removeToast("nonexistent-id");

      expect(useToastStore.getState().toasts).toHaveLength(before);
    });
  });
});
