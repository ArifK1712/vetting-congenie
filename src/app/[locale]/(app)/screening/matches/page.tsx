import { Suspense } from "react";
import { MatchReviewPage } from "@/features/matchReview/MatchReviewPage";
import { EnglishOnly } from "@/features/workflows/EnglishOnly";

export default function Page() {
  return (
    <EnglishOnly>
      <Suspense>
        <MatchReviewPage />
      </Suspense>
    </EnglishOnly>
  );
}
