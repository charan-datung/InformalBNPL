"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Stage 1 auth: email + password via Supabase Auth. Signup collects ONLY
 * credentials — no role, no name. The handle_new_user trigger creates the
 * public.users row with staff_role null; capability and underwriting come later
 * in onboarding.
 *
 * The Supabase work is wrapped in try/catch and redirect() is called OUTSIDE
 * the try, so any unexpected error becomes a visible message instead of an
 * unhandled 500 (and is logged for the server logs). redirect() throws a
 * special control-flow error, which must never be swallowed.
 */

async function getOrigin(): Promise<string> {
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Unexpected error during sign up.";
}

export async function signUpAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect(
      "/signup?error=" + encodeURIComponent("Email and password are required."),
    );
  }

  let target: string;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { contact: phone || email },
        emailRedirectTo: `${await getOrigin()}/auth/confirm?next=/onboarding`,
      },
    });

    if (error) {
      target = "/signup?error=" + encodeURIComponent(error.message);
    } else if (data.session) {
      // Email confirmation disabled -> logged in immediately.
      target = "/onboarding";
    } else {
      target = "/signup?check_email=1";
    }
  } catch (e) {
    console.error("signUpAction failed:", e);
    target = "/signup?error=" + encodeURIComponent(errorMessage(e));
  }

  redirect(target);
}

export async function signInAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  let target: string;
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    target = error
      ? "/login?error=" + encodeURIComponent(error.message)
      : "/dashboard";
  } catch (e) {
    console.error("signInAction failed:", e);
    target = "/login?error=" + encodeURIComponent(errorMessage(e));
  }

  redirect(target);
}

export async function signOutAction() {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch (e) {
    console.error("signOutAction failed:", e);
  }
  redirect("/");
}
