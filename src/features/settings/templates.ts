import type { LocalizedText } from "@/domain/types";
import arCore from "../../../messages/ar.json";
import enCore from "../../../messages/en.json";

type Built = Record<string, { subject: string; body: string; button?: string; name?: string }>;
const EN = enCore.outbox.templates as Built;
const AR = arCore.outbox.templates as Built;

/** Built-in wording of an email in both languages (the raw message text with {placeholders}). */
export function builtInTemplate(key: string): { subject: LocalizedText; body: LocalizedText; button: LocalizedText } {
  return {
    subject: { en: EN[key]?.subject ?? "", ar: AR[key]?.subject ?? "" },
    body: { en: EN[key]?.body ?? "", ar: AR[key]?.body ?? "" },
    button: { en: EN[key]?.button ?? "", ar: AR[key]?.button ?? "" },
  };
}
