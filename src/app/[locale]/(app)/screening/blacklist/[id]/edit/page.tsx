import { Suspense } from "react";
import { EntryFormPage } from "@/features/blacklist/EntryFormPage";

export default async function Page({ params }: PageProps<"/[locale]/screening/blacklist/[id]/edit">) {
  const { id } = await params;
  return (
    <Suspense>
      <EntryFormPage id={decodeURIComponent(id)} />
    </Suspense>
  );
}
