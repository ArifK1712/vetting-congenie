import { EnglishOnly } from "@/features/workflows/EnglishOnly";
import { WatchImportPage } from "@/features/watchlist/WatchImportPage";

export default function Page() {
  return (
    <EnglishOnly>
      <WatchImportPage />
    </EnglishOnly>
  );
}
