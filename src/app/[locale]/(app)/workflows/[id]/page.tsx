import { Suspense } from "react";
import { BuilderPage } from "@/features/workflows/builder/BuilderPage";

export default async function Page({ params }: PageProps<"/[locale]/workflows/[id]">) {
  const { id } = await params;
  return (
    <Suspense>
      <BuilderPage id={decodeURIComponent(id)} />
    </Suspense>
  );
}
