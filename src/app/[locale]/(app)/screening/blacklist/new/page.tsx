import { Suspense } from "react";
import { EntryFormPage } from "@/features/blacklist/EntryFormPage";
import { EnglishOnly } from "@/features/workflows/EnglishOnly";

export default function Page() {
  return (
    <EnglishOnly>
      <Suspense>
        <EntryFormPage id={null} />
      </Suspense>
    </EnglishOnly>
  );
}
