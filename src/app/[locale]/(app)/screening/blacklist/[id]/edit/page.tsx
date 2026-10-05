import { Suspense } from "react";
import { EntryFormPage } from "@/features/blacklist/EntryFormPage";
import { EnglishOnly } from "@/features/workflows/EnglishOnly";

export default async function Page({ params }: PageProps<"/[locale]/screening/blacklist/[id]/edit">) {
  const { id } = await params;
  return (
    <EnglishOnly>
      <Suspense>
        <EntryFormPage id={decodeURIComponent(id)} />
      </Suspense>
    </EnglishOnly>
  );
}
