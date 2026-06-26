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
  // Set when the buyer arrived via a seller's invite link/QR (?ref=<sellerId>),
  // so we can attribute the buyer to the seller who referred them.
  const ref = String(formData.get("ref") ?? "").trim();
  // A seller-acquisition link routes straight into seller onboarding, and may
  // carry the referring seller (?intent=seller&sref=<sellerId>) so a qualifying
  // first order later pays that referrer a bounty.
  const intent = String(formData.get("intent") ?? "").trim();
  const sref = String(formData.get("sref") ?? "").trim();
  const onboardingNext = intent === "seller" ? "/onboarding/seller" : "/onboarding";

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
        data: {
          contact: phone || email,
          ...(ref ? { referred_by_seller: ref } : {}),
          ...(sref ? { seller_referrer_id: sref } : {}),
          // Persist seller intent so onboarding can route there even when email
          // confirmation is on (the static email template can't carry `next`).
          ...(intent === "seller" ? { signup_intent: "seller" } : {}),
        },
        emailRedirectTo: `${await getOrigin()}/auth/confirm?next=${encodeURIComponent(
          onboardingNext,
        )}`,
      },
    });

    if (error) {
      target = "/signup?error=" + encodeURIComponent(error.message);
    } else if (data.session) {
      // Email confirmation disabled -> logged in immediately.
      target = onboardingNext;
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

/**
 * Stage 1 password recovery — send a reset link. We always redirect to the same
 * "check your email" state regardless of whether the address exists, so the form
 * never reveals which emails are registered. The link lands on /auth/confirm,
 * which establishes a short-lived recovery session and forwards to
 * /reset-password.
 */
export async function requestPasswordResetAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    redirect(
      "/forgot-password?error=" + encodeURIComponent("Enter your email."),
    );
  }
  try {
    const supabase = await createClient();
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${await getOrigin()}/auth/confirm?next=/reset-password`,
    });
  } catch (e) {
    // Log but still show the neutral confirmation (don't leak existence/errors).
    console.error("requestPasswordResetAction failed:", e);
  }
  redirect("/forgot-password?sent=1");
}

/** Set a new password using the recovery session from the email link. */
export async function updatePasswordAction(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 8) {
    redirect(
      "/reset-password?error=" +
        encodeURIComponent("Use at least 8 characters."),
    );
  }
  if (password !== confirm) {
    redirect(
      "/reset-password?error=" + encodeURIComponent("Passwords do not match."),
    );
  }

  let target: string;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      target =
        "/forgot-password?error=" +
        encodeURIComponent("Your reset link has expired — request a new one.");
    } else {
      const { error } = await supabase.auth.updateUser({ password });
      target = error
        ? "/reset-password?error=" + encodeURIComponent(error.message)
        : "/dashboard";
    }
  } catch (e) {
    console.error("updatePasswordAction failed:", e);
    target =
      "/reset-password?error=" +
      encodeURIComponent(e instanceof Error ? e.message : "Unexpected error.");
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
