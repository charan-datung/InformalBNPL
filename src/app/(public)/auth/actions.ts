"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Stage 1 auth: email + password via Supabase Auth. Signup collects ONLY
 * credentials — no role, no name. The handle_new_user trigger creates the
 * public.users row with staff_role null; capability and underwriting come later
 * in onboarding.
 */

async function getOrigin(): Promise<string> {
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

export async function signUpAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect("/signup?error=" + encodeURIComponent("Email and password are required."));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Stored on auth user metadata; handle_new_user copies contact into
      // public.users. Name is collected later during onboarding.
      data: { contact: phone || email },
      emailRedirectTo: `${await getOrigin()}/auth/confirm?next=/onboarding`,
    },
  });

  if (error) {
    redirect("/signup?error=" + encodeURIComponent(error.message));
  }

  // If email confirmation is disabled, signUp returns a session and the user is
  // logged in immediately -> go choose a role. Otherwise, ask them to confirm.
  if (data.session) {
    redirect("/onboarding");
  }
  redirect("/signup?check_email=1");
}

export async function signInAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect("/login?error=" + encodeURIComponent(error.message));
  }
  redirect("/dashboard");
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
