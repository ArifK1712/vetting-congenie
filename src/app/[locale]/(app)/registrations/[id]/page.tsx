import { RegistrationDetailPage } from "@/features/registrations/RegistrationDetailPage";

export default async function Page({ params }: PageProps<"/[locale]/registrations/[id]">) {
  const { id } = await params;
  return <RegistrationDetailPage id={decodeURIComponent(id)} />;
}
