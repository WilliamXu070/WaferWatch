import { redirect } from "next/navigation";
import { confirmationRedirectPath } from "@/lib/auth/confirmation-redirect";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{
    code?: string;
    error?: string;
    error_code?: string;
    error_description?: string;
    message?: string;
    next?: string;
    token_hash?: string;
    type?: string;
  }>;
}) {
  const params = await searchParams;
  const confirmationPath = confirmationRedirectPath(params);

  if (confirmationPath) {
    redirect(confirmationPath);
  }

  const query = new URLSearchParams();

  if (params.error) query.set("error", params.error);
  if (params.error_code) query.set("error_code", params.error_code);
  if (params.error_description) query.set("error_description", params.error_description);
  if (params.message) query.set("message", params.message);

  redirect(query.toString() ? `/?${query.toString()}` : "/");
}
