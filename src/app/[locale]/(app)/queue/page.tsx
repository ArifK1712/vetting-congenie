import { Suspense } from "react";
import { QueuePage } from "@/features/queue/QueuePage";

export default function Page() {
  return (
    <Suspense>
      <QueuePage />
    </Suspense>
  );
}
