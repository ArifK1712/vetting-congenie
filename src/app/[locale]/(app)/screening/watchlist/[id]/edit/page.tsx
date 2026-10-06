import { Suspense } from "react";
import { WatchEntryFormPage } from "@/features/watchlist/WatchEntryFormPage";

export default async function Page({ params }: PageProps<"/[locale]/screening/watchlist/[id]/edit">) {
  const { id } = await params;
  return (
    <Suspense>
      <WatchEntryFormPage id={decodeURIComponent(id)} />
    </Suspense>
  );
}
