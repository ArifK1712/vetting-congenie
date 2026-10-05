import { EntryDetailPage } from "@/features/blacklist/EntryDetailPage";
import { EnglishOnly } from "@/features/workflows/EnglishOnly";

export default async function Page({ params }: PageProps<"/[locale]/screening/blacklist/[id]">) {
  const { id } = await params;
  return (
    <EnglishOnly>
      <EntryDetailPage id={decodeURIComponent(id)} />
    </EnglishOnly>
  );
}
