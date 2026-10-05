import { Suspense } from "react";
import { EnglishOnly } from "@/features/workflows/EnglishOnly";
import { WatchEntryFormPage } from "@/features/watchlist/WatchEntryFormPage";

export default function Page() {
  return (
    <EnglishOnly>
      <Suspense>
        <WatchEntryFormPage id={null} />
      </Suspense>
    </EnglishOnly>
  );
}
