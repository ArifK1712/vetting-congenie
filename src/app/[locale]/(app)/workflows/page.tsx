import { EnglishOnly } from "@/features/workflows/EnglishOnly";
import { WorkflowsListPage } from "@/features/workflows/WorkflowsListPage";

export default function Page() {
  return (
    <EnglishOnly>
      <WorkflowsListPage />
    </EnglishOnly>
  );
}
