import { Suspense } from "react";
import { WatchEntryFormPage } from "@/features/watchlist/WatchEntryFormPage";

export default function Page() {
  return (
    <Suspense>
      <WatchEntryFormPage id={null} />
    </Suspense>
  );
}
