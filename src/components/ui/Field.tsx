"use client";

import { Check } from "lucide-react";
import { useId, type InputHTMLAttributes, type KeyboardEvent, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className="text-sm font-semibold text-ink">
          {label}
        </label>
        {hint && <span className="text-xs text-ink-3">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export function TextInput({ className, invalid, ...props }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      dir="auto"
      aria-invalid={invalid || undefined}
      className={cn(
        "block h-9 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink shadow-xs outline-none placeholder:text-ink-3 focus:border-accent focus:ring-4 focus:ring-accent/10",
        invalid && "border-rose-300 focus:border-rose-400 focus:ring-rose-500/10",
        className,
      )}
      {...props}
    />
  );
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      dir="auto"
      rows={3}
      className={cn(
        "block w-full resize-y rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink shadow-xs outline-none placeholder:text-ink-3 focus:border-accent focus:ring-4 focus:ring-accent/10",
        className,
      )}
      {...props}
    />
  );
}

export interface Choice {
  value: string;
  label: ReactNode;
  hint?: ReactNode;
  aside?: ReactNode;
  disabled?: boolean;
}

/** Single-choice list with roving keyboard focus (↑/↓), styled as selectable rows. */
export function ChoiceList({
  label,
  choices,
  value,
  onChange,
}: {
  label: string;
  choices: Choice[];
  value: string | null;
  onChange: (v: string) => void;
}) {
  const id = useId();
  const enabled = choices.filter((c) => !c.disabled);
  const onKey = (e: KeyboardEvent, current: string) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const i = enabled.findIndex((c) => c.value === current);
    const next = enabled[(i + (e.key === "ArrowDown" ? 1 : enabled.length - 1)) % enabled.length];
    onChange(next.value);
    document.getElementById(`${id}-${next.value}`)?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} className="max-h-72 space-y-1.5 overflow-y-auto">
      {choices.map((c, i) => {
        const selected = c.value === value;
        const focusable = selected || (!value && i === 0);
        return (
          <button
            key={c.value}
            id={`${id}-${c.value}`}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={c.disabled}
            tabIndex={focusable ? 0 : -1}
            onClick={() => onChange(c.value)}
            onKeyDown={(e) => onKey(e, c.value)}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start ring-1 transition-colors outline-none ring-inset focus-visible:ring-2 focus-visible:ring-accent",
              selected ? "bg-accent-soft ring-indigo-300" : "bg-surface ring-line hover:bg-subtle",
              c.disabled && "cursor-not-allowed opacity-50 hover:bg-surface",
            )}
          >
            <span
              className={cn(
                "inline-flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                selected ? "border-accent bg-accent text-white" : "border-line-strong bg-surface",
              )}
            >
              {selected && <Check className="size-2.5" strokeWidth={4} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-ink">{c.label}</span>
              {c.hint && <span className="block text-xs text-ink-3">{c.hint}</span>}
            </span>
            {c.aside}
          </button>
        );
      })}
    </div>
  );
}
