import { ImportPage } from "@/features/blacklist/ImportPage";
import { EnglishOnly } from "@/features/workflows/EnglishOnly";

export default function Page() {
  return (
    <EnglishOnly>
      <ImportPage />
    </EnglishOnly>
  );
}
