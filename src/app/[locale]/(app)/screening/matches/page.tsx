import { Suspense } from "react";
import { MatchReviewPage } from "@/features/matchReview/MatchReviewPage";

export default function Page() {
  return (
    <Suspense>
      <MatchReviewPage />
    </Suspense>
  );
}
