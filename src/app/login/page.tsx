import { redirect } from "next/navigation";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();

  if (params.error) query.set("error", params.error);
  if (params.message) query.set("message", params.message);

  redirect(query.toString() ? `/?${query.toString()}` : "/");
}
