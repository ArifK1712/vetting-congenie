"use client";

import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronDown, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { usePortalContainer } from "./portal";

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
  group?: string;
  marker?: ReactNode;
}

const triggerClass =
  "flex h-9 w-full min-w-0 items-center gap-2 rounded-lg border border-line-strong bg-surface ps-3 pe-2 text-start text-sm text-ink shadow-xs outline-none transition-colors hover:bg-subtle focus-visible:border-accent focus-visible:ring-4 focus-visible:ring-accent/10 data-[state=open]:border-accent";

function OptionRows({
  options,
  isSelected,
  onPick,
  multi,
  searchable,
}: {
  options: SelectOption[];
  isSelected: (v: string) => boolean;
  onPick: (v: string) => void;
  multi: boolean;
  searchable: boolean;
}) {
  const t = useTranslations("common");
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => `${o.label} ${o.hint ?? ""} ${o.value}`.toLowerCase().includes(q)) : options;
  }, [options, query]);

  return (
    <>
      {searchable && (
        <div className="flex items-center gap-2 border-b border-line px-2.5">
          <Search className="size-3.5 shrink-0 text-ink-3" />
          <input
            autoFocus
            dir="auto"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchOptions")}
            className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-ink-3"
          />
        </div>
      )}
      <div role="listbox" aria-multiselectable={multi} className="max-h-72 overflow-y-auto p-1">
        {visible.length === 0 && <p className="px-2 py-3 text-sm text-ink-3">{t("noResults")}</p>}
        {visible.map((o, i) => {
          const selected = isSelected(o.value);
          const header = o.group && o.group !== visible[i - 1]?.group ? o.group : null;
          return (
            <div key={o.value}>
              {header && <p className="eyebrow px-2 pt-2.5 pb-1">{header}</p>}
              <button
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => onPick(o.value)}
                className="flex min-h-8 w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-start text-sm text-ink outline-none hover:bg-hover focus-visible:bg-hover"
              >
                {multi && (
                  <span
                    className={cn(
                      "inline-flex size-4 shrink-0 items-center justify-center rounded-xs border transition-colors",
                      selected ? "border-accent bg-accent text-on-accent" : "border-line-strong bg-surface",
                    )}
                  >
                    {selected && <Check className="size-3" strokeWidth={3} />}
                  </span>
                )}
                {o.marker}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{o.label}</span>
                  {o.hint && <span className="block truncate text-xs text-ink-3">{o.hint}</span>}
                </span>
                {!multi && selected && <Check className="size-4 shrink-0 text-accent" />}
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}

function Content({ children, wide }: { children: ReactNode; wide?: boolean }) {
  const container = usePortalContainer();
  return (
    <Popover.Portal container={container}>
      <Popover.Content
        align="start"
        sideOffset={6}
        collisionPadding={8}
        className={cn(
          "anim-pop z-50 overflow-hidden rounded-xl border border-line bg-surface shadow-pop",
          wide ? "w-80" : "w-[max(var(--radix-popover-trigger-width),14rem)]",
        )}
      >
        {children}
      </Popover.Content>
    </Popover.Portal>
  );
}

/** Form select: looks like an input, opens a list (optionally grouped and searchable). */
export function Select({
  label,
  options,
  value,
  onChange,
  placeholder,
  searchable,
  invalid,
  className,
}: {
  label: string;
  options: SelectOption[];
  value: string | null;
  onChange: (v: string) => void;
  placeholder?: string;
  searchable?: boolean;
  invalid?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger aria-label={label} className={cn(triggerClass, invalid && "border-rose-300", className)}>
        {current?.marker}
        <span className={cn("min-w-0 flex-1 truncate", !current && "text-ink-3")}>{current?.label ?? placeholder}</span>
        <ChevronDown className="size-4 shrink-0 text-ink-3" />
      </Popover.Trigger>
      <Content wide={searchable}>
        <OptionRows
          options={options}
          multi={false}
          searchable={!!searchable}
          isSelected={(v) => v === value}
          onPick={(v) => {
            onChange(v);
            setOpen(false);
          }}
        />
      </Content>
    </Popover.Root>
  );
}

/** Several values from a list; the trigger summarises the choice. */
export function MultiSelect({
  label,
  options,
  value,
  onChange,
  placeholder,
  summary,
  searchable,
  invalid,
  className,
}: {
  label: string;
  options: SelectOption[];
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  summary: (labels: string[]) => string;
  searchable?: boolean;
  invalid?: boolean;
  className?: string;
}) {
  const labels = value.map((v) => options.find((o) => o.value === v)?.label ?? v);
  return (
    <Popover.Root>
      <Popover.Trigger aria-label={label} className={cn(triggerClass, invalid && "border-rose-300", className)}>
        <span className={cn("min-w-0 flex-1 truncate", !value.length && "text-ink-3")}>{value.length ? summary(labels) : placeholder}</span>
        <ChevronDown className="size-4 shrink-0 text-ink-3" />
      </Popover.Trigger>
      <Content wide={searchable}>
        <OptionRows
          options={options}
          multi
          searchable={!!searchable}
          isSelected={(v) => value.includes(v)}
          onPick={(v) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])}
        />
      </Content>
    </Popover.Root>
  );
}
