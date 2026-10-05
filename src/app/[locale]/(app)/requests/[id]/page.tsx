import { RequestDetailPage } from "@/features/request-detail/RequestDetailPage";

export default async function Page({ params }: PageProps<"/[locale]/requests/[id]">) {
  const { id } = await params;
  return <RequestDetailPage id={decodeURIComponent(id)} />;
}
