/**
 * Messages are split: messages/<locale>.json for the core app, and
 * messages/modules/<module>/<locale>.json for larger modules, so modules can
 * be translated independently. Each module file holds one top-level key.
 */
import arCore from "../../messages/ar.json";
import enCore from "../../messages/en.json";
import appearanceAr from "../../messages/modules/appearance/ar.json";
import appearanceEn from "../../messages/modules/appearance/en.json";
import attendeesAr from "../../messages/modules/attendees/ar.json";
import attendeesEn from "../../messages/modules/attendees/en.json";
import blacklistAr from "../../messages/modules/blacklist/ar.json";
import blacklistEn from "../../messages/modules/blacklist/en.json";
import matchReviewAr from "../../messages/modules/matchReview/ar.json";
import matchReviewEn from "../../messages/modules/matchReview/en.json";
import reportsAr from "../../messages/modules/reports/ar.json";
import reportsEn from "../../messages/modules/reports/en.json";
import registrationsAr from "../../messages/modules/registrations/ar.json";
import registrationsEn from "../../messages/modules/registrations/en.json";
import settingsAr from "../../messages/modules/settings/ar.json";
import settingsEn from "../../messages/modules/settings/en.json";
import simulateAr from "../../messages/modules/simulate/ar.json";
import simulateEn from "../../messages/modules/simulate/en.json";
import watchlistAr from "../../messages/modules/watchlist/ar.json";
import watchlistEn from "../../messages/modules/watchlist/en.json";
import workflowsAr from "../../messages/modules/workflows/ar.json";
import workflowsEn from "../../messages/modules/workflows/en.json";

export const enMessages = { ...enCore, ...workflowsEn, ...blacklistEn, ...watchlistEn, ...matchReviewEn, ...registrationsEn, ...simulateEn, ...attendeesEn, ...reportsEn, ...settingsEn, ...appearanceEn };
export const arMessages = { ...arCore, ...workflowsAr, ...blacklistAr, ...watchlistAr, ...matchReviewAr, ...registrationsAr, ...simulateAr, ...attendeesAr, ...reportsAr, ...settingsAr, ...appearanceAr };

export type AppMessages = typeof enMessages;

export const messagesFor = (locale: string) => (locale === "ar" ? arMessages : enMessages);
