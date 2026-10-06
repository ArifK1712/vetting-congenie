import { createNavigation } from "next-intl/navigation";
import { useLocale } from "next-intl";
import { useMemo } from "react";
import { useNav } from "@/lib/navProgress";
import { routing } from "./routing";

const nav = createNavigation(routing);

export const { Link, redirect, usePathname, getPathname } = nav;

type Router = ReturnType<typeof nav.useRouter>;
type Href = Parameters<Router["push"]>[0];
type Options = Parameters<Router["push"]>[1];

/** Path part of an href, without query or hash. */
function pathOf(href: Href): string {
  const raw = typeof href === "string" ? href : String(href.pathname ?? "");
  return raw.split(/[?#]/)[0];
}

/**
 * next-intl's router, plus page-change feedback: push/replace announce the
 * target so the shell can show a skeleton immediately (see navProgress).
 */
export function useRouter(): Router {
  const router = nav.useRouter();
  const locale = useLocale();
  const start = useNav((s) => s.start);
  return useMemo(() => {
    const announce = (href: Href, options?: Options) => {
      const path = pathOf(href);
      if (path) start(`/${options?.locale ?? locale}${path === "/" ? "" : path}`);
    };
    return {
      ...router,
      push: (href, options) => {
        announce(href, options);
        router.push(href, options);
      },
      replace: (href, options) => {
        announce(href, options);
        router.replace(href, options);
      },
    } as Router;
  }, [router, locale, start]);
}
