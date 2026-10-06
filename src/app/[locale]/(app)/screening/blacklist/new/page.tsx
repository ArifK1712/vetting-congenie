import { Suspense } from "react";
import { EntryFormPage } from "@/features/blacklist/EntryFormPage";

export default function Page() {
  return (
    <Suspense>
      <EntryFormPage id={null} />
    </Suspense>
  );
}
