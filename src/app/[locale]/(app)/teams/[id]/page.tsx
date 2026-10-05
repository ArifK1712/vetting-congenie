import { TeamDetailPage } from "@/features/teams/TeamDetailPage";

export default async function Page({ params }: PageProps<"/[locale]/teams/[id]">) {
  const { id } = await params;
  return <TeamDetailPage id={decodeURIComponent(id)} />;
}
