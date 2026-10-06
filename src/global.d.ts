import type { routing } from "@/i18n/routing";
import type { AppMessages } from "@/i18n/messages";

declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: AppMessages;
  }
}
