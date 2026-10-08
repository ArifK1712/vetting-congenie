"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { usePathname } from "@/i18n/navigation";
import { useMedia } from "@/lib/useMedia";
import { useSession } from "@/store/app";
import { Brand } from "./Brand";
import { useAppearanceItem, useNavGroups } from "./model";
import { NavLink, NavList } from "./NavList";

/**
 * Phone navigation: the same drawer in every layout preset. Opens from the
 * header's menu button, slides in from the start side (right in Arabic),
 * and closes on navigation and when the screen grows past phone width.
 */
export function MobileNav() {
  const t = useTranslations("navigation");
  const open = useSession((s) => s.navOpen);
  const setOpen = useSession((s) => s.setNavOpen);
  const pathname = usePathname();
  const wide = useMedia("(min-width: 768px)");
  const groups = useNavGroups();
  const appearance = useAppearanceItem();

  useEffect(() => {
    setOpen(false);
  }, [pathname, wide, setOpen]);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="anim-fade fixed inset-0 z-50 bg-overlay md:hidden" />
        <Dialog.Content
          aria-describedby={undefined}
          className="anim-drawer fixed inset-y-0 start-0 z-50 flex w-[min(18rem,85vw)] flex-col bg-nav text-nav-text shadow-panel outline-none md:hidden"
        >
          <Dialog.Title className="sr-only">{t("mainNavigation")}</Dialog.Title>
          <div className="flex h-16 shrink-0 items-center justify-between ps-5 pe-3">
            <Brand />
            <Dialog.Close
              aria-label={t("close")}
              className="inline-flex size-9 items-center justify-center rounded-lg text-nav-muted hover:bg-nav-hover hover:text-nav-strong"
            >
              <X className="size-[18px]" strokeWidth={1.75} />
            </Dialog.Close>
          </div>
          <NavList groups={groups} variant="full" />
          <div className="shrink-0 border-t border-nav-line p-3">
            <NavLink item={appearance} variant="full" />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
