"use server";

import { redirect } from "next/navigation";
import { logout } from "@/lib/auth/login";

export async function logoutAction() {
  await logout();
  redirect("/login");
}
