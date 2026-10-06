import { InfoFormPage } from "@/features/portal/InfoFormPage";

export default async function Page({ params }: PageProps<"/[locale]/portal/info/[token]">) {
  const { token } = await params;
  return <InfoFormPage token={decodeURIComponent(token)} />;
}
