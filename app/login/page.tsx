import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold tracking-tight">Keep.Books</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in to your firm workspace</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
