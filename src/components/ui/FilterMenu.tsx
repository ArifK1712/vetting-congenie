"use client";

import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface FilterOption {
  value: string;
  label: string;
  hint?: string;
  marker?: ReactNode;
}

interface BaseProps {
  label: string;
  options: FilterOption[];
  searchable?: boolean;
}

function Trigger({ label, summary, active, onClear }: { label: string; summary?: string; active: boolean; onClear?: () => void }) {
  const t = useTranslations("common");
  return (
    <span className="inline-flex items-stretch">
      <Popover.Trigger
        className={cn(
          "inline-flex h-8 items-center gap-1.5 border px-3 text-xs font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent",
          active
            ? "rounded-s-lg border-indigo-200 bg-accent-soft text-accent-text"
            : "rounded-lg border-dashed border-line-strong bg-surface text-ink-2 hover:border-solid hover:bg-subtle hover:text-ink",
          active && !onClear && "rounded-e-lg",
        )}
      >
        <span className={cn(active && "text-accent-text/80")}>{label}</span>
        {summary && <span className="max-w-40 truncate font-semibold">{summary}</span>}
        {!active && <ChevronDown className="size-3.5 text-ink-3" />}
      </Popover.Trigger>
      {active && onClear && (
        <button
          type="button"
          onClick={onClear}
          aria-label={`${t("clear")} ${label}`}
          className="inline-flex h-8 w-7 items-center justify-center rounded-e-lg border border-s-0 border-indigo-200 bg-accent-soft text-accent-text hover:bg-indigo-100"
        >
          <X className="size-3" />
        </button>
      )}
    </span>
  );
}

function OptionList({
  options,
  searchable,
  isSelected,
  onToggle,
  multi,
}: {
  options: FilterOption[];
  searchable?: boolean;
  isSelected: (v: string) => boolean;
  onToggle: (v: string) => void;
  multi: boolean;
}) {
  const t = useTranslations("common");
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => `${o.label} ${o.hint ?? ""}`.toLowerCase().includes(q)) : options;
  }, [options, query]);

  return (
    <>
      {searchable && (
        <div className="flex items-center gap-2 border-b border-line px-2.5">
          <Search className="size-3.5 shrink-0 text-ink-3" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchOptions")}
            className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-ink-3"
          />
        </div>
      )}
      <div role="listbox" aria-multiselectable={multi} className="max-h-72 overflow-y-auto p-1">
        {visible.length === 0 && <p className="px-2 py-3 text-sm text-ink-3">{t("noResults")}</p>}
        {visible.map((o) => {
          const selected = isSelected(o.value);
          return (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => onToggle(o.value)}
              className="flex min-h-8 w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-start text-sm text-ink outline-none hover:bg-hover focus-visible:bg-hover"
            >
              <span
                className={cn(
                  "inline-flex size-4 shrink-0 items-center justify-center border transition-colors",
                  multi ? "rounded-xs" : "rounded-full",
                  selected ? "border-accent bg-accent text-ink-inverse" : "border-line-strong bg-surface",
                )}
              >
                {selected && (multi ? <Check className="size-3" strokeWidth={3} /> : <span className="size-1.5 rounded-full bg-surface" />)}
              </span>
              {o.marker}
              <span className="min-w-0 flex-1">
                <span className="block truncate">{o.label}</span>
                {o.hint && <span className="block truncate text-xs text-ink-3">{o.hint}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function Panel({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <Popover.Portal>
      <Popover.Content
        align="start"
        sideOffset={6}
        collisionPadding={8}
        className={cn("anim-pop z-50 overflow-hidden rounded-xl border border-line bg-surface shadow-pop", wide ? "w-80" : "w-64")}
      >
        {children}
      </Popover.Content>
    </Popover.Portal>
  );
}

export function MultiFilter({
  label,
  options,
  value,
  onChange,
  searchable,
  wide,
}: BaseProps & { value: string[]; onChange: (v: string[]) => void; wide?: boolean }) {
  const t = useTranslations("common");
  const summary =
    value.length === 0
      ? undefined
      : value.length === 1
        ? options.find((o) => o.value === value[0])?.label
        : t("selected", { n: value.length });
  return (
    <Popover.Root>
      <Trigger label={label} summary={summary} active={value.length > 0} onClear={() => onChange([])} />
      <Panel wide={wide}>
        <OptionList
          multi
          options={options}
          searchable={searchable}
          isSelected={(v) => value.includes(v)}
          onToggle={(v) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])}
        />
      </Panel>
    </Popover.Root>
  );
}

export function SingleFilter({
  label,
  options,
  value,
  defaultValue,
  onChange,
  alwaysShowValue,
}: BaseProps & { value: string; defaultValue: string; onChange: (v: string) => void; alwaysShowValue?: boolean }) {
  const [open, setOpen] = useState(false);
  const active = value !== defaultValue;
  const summary = active || alwaysShowValue ? options.find((o) => o.value === value)?.label : undefined;
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Trigger
        label={label}
        summary={summary}
        active={active}
        onClear={active ? () => onChange(defaultValue) : undefined}
      />
      <Panel>
        <OptionList
          multi={false}
          options={options}
          isSelected={(v) => v === value}
          onToggle={(v) => {
            onChange(v);
            setOpen(false);
          }}
        />
      </Panel>
    </Popover.Root>
  );
}
