"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { create } from "zustand";

interface ToastItem {
  id: number;
  message: string;
}

const useToasts = create<{ items: ToastItem[]; push: (m: string) => void; dismiss: (id: number) => void }>((set) => ({
  items: [],
  push: (message) => set((s) => ({ items: [...s.items.slice(-2), { id: Date.now() + Math.random(), message }] })),
  dismiss: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
}));

export const toast = (message: string) => useToasts.getState().push(message);

function ToastRow({ item }: { item: ToastItem }) {
  const dismiss = useToasts((s) => s.dismiss);
  const t = useTranslations("toast");
  useEffect(() => {
    const timer = setTimeout(() => dismiss(item.id), 4000);
    return () => clearTimeout(timer);
  }, [item.id, dismiss]);
  return (
    <div role="status" className="anim-pop flex items-center gap-3 rounded-xl bg-surface py-2.5 ps-4 pe-1.5 text-sm font-medium text-ink shadow-pop ring-1 ring-line">
      <span dir="auto" className="flex-1">{item.message}</span>
      <button
        type="button"
        onClick={() => dismiss(item.id)}
        aria-label={t("dismiss")}
        className="inline-flex size-6 items-center justify-center rounded-md text-ink-3 hover:bg-hover hover:text-ink"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

export function Toaster() {
  const items = useToasts((s) => s.items);
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-4 end-4 z-[60] flex w-80 flex-col gap-2 [&>*]:pointer-events-auto">
      {items.map((i) => (
        <ToastRow key={i.id} item={i} />
      ))}
    </div>
  );
}
