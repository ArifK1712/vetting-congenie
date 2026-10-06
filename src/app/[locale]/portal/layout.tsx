import type { ReactNode } from "react";
import { PortalShell } from "@/features/portal/PortalShell";

export default function PortalLayout({ children }: { children: ReactNode }) {
  return <PortalShell>{children}</PortalShell>;
}
