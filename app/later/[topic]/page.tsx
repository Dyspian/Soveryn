import { notFound, redirect } from "next/navigation";

const destinations: Record<string, string> = {
  skills: "/skills",
  missions: "/missions",
  businesses: "/businesses",
  economy: "/businesses",
  resources: "/resources",
  politics: "/politics",
  organizations: "/organizations",
};

export default async function LaterPage({ params }: { params: Promise<{ topic: string }> }) {
  const { topic } = await params;
  const destination = destinations[topic];
  if (!destination) notFound();
  redirect(destination);
}
