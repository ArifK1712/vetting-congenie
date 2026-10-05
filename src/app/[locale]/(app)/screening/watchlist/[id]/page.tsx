import { EnglishOnly } from "@/features/workflows/EnglishOnly";
import { WatchEntryDetailPage } from "@/features/watchlist/WatchEntryDetailPage";

export default async function Page({ params }: PageProps<"/[locale]/screening/watchlist/[id]">) {
  const { id } = await params;
  return (
    <EnglishOnly>
      <WatchEntryDetailPage id={decodeURIComponent(id)} />
    </EnglishOnly>
  );
}
