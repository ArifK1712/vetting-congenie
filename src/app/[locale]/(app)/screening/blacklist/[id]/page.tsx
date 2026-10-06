import { EntryDetailPage } from "@/features/blacklist/EntryDetailPage";

export default async function Page({ params }: PageProps<"/[locale]/screening/blacklist/[id]">) {
  const { id } = await params;
  return <EntryDetailPage id={decodeURIComponent(id)} />;
}
