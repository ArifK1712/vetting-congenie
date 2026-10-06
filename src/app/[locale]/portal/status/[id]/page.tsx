import { StatusPage } from "@/features/portal/StatusPage";

export default async function Page({ params }: PageProps<"/[locale]/portal/status/[id]">) {
  const { id } = await params;
  return <StatusPage id={decodeURIComponent(id)} />;
}
