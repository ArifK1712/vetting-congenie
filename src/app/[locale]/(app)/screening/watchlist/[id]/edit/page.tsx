import { Suspense } from "react";
import { EnglishOnly } from "@/features/workflows/EnglishOnly";
import { WatchEntryFormPage } from "@/features/watchlist/WatchEntryFormPage";

export default async function Page({ params }: PageProps<"/[locale]/screening/watchlist/[id]/edit">) {
  const { id } = await params;
  return (
    <EnglishOnly>
      <Suspense>
        <WatchEntryFormPage id={decodeURIComponent(id)} />
      </Suspense>
    </EnglishOnly>
  );
}
