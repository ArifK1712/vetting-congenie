import { WatchEntryDetailPage } from "@/features/watchlist/WatchEntryDetailPage";

export default async function Page({ params }: PageProps<"/[locale]/screening/watchlist/[id]">) {
  const { id } = await params;
  return <WatchEntryDetailPage id={decodeURIComponent(id)} />;
}
