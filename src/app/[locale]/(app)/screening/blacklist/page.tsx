import { Suspense } from "react";
import { BlacklistListPage } from "@/features/blacklist/BlacklistListPage";

export default function Page() {
  return (
    <Suspense>
      <BlacklistListPage />
    </Suspense>
  );
}
