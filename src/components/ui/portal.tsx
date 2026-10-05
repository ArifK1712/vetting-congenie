"use client";

import { createContext, useContext } from "react";

/**
 * Where popovers, menus, dialogs and tooltips mount. Defaults to <body>; an
 * area with its own language and direction (e.g. the English-only Workflows
 * screens) provides a container inside itself so pop-ups inherit them.
 */
export const PortalContainerContext = createContext<HTMLElement | null>(null);

export const usePortalContainer = () => useContext(PortalContainerContext) ?? undefined;
