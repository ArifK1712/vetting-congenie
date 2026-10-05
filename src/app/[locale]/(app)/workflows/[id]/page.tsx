import { Suspense } from "react";
import { BuilderPage } from "@/features/workflows/builder/BuilderPage";
import { EnglishOnly } from "@/features/workflows/EnglishOnly";

export default async function Page({ params }: PageProps<"/[locale]/workflows/[id]">) {
  const { id } = await params;
  return (
    <EnglishOnly>
      <Suspense>
        <BuilderPage id={decodeURIComponent(id)} />
      </Suspense>
    </EnglishOnly>
  );
}
