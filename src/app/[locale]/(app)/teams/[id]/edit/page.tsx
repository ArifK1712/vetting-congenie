import { TeamEditorPage } from "@/features/teams/TeamEditorPage";

export default async function Page({ params }: PageProps<"/[locale]/teams/[id]/edit">) {
  const { id } = await params;
  return <TeamEditorPage id={decodeURIComponent(id)} />;
}
