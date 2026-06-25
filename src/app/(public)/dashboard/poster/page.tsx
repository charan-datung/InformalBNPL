import QRCode from "qrcode";
import { redirect } from "next/navigation";
import { getCapabilities } from "@/lib/profiles/capabilities";
import { getRequestOrigin } from "@/lib/http/origin";
import { Wordmark } from "@/components/brand/Logo";
import PrintButton from "@/app/(public)/dashboard/poster/PrintButton";

// Session-dependent + builds an absolute invite URL from request headers.
export const dynamic = "force-dynamic";

/**
 * Print-optimized A4 stall poster a verified seller can tape up: big QR that
 * deep-links to buyer sign-up carrying their ?ref attribution, plus three
 * plain-language steps. The print button hides itself when printing.
 */
export default async function PosterPage() {
  const caps = await getCapabilities();
  if (!caps) redirect("/login");
  if (caps.seller !== "verified") redirect("/dashboard");

  const origin = await getRequestOrigin();
  const inviteUrl = `${origin}/signup?ref=${caps.userId}`;
  const qrSvg = await QRCode.toString(inviteUrl, {
    type: "svg",
    margin: 1,
    color: { dark: "#0e4d45", light: "#ffffff" },
  });

  const sellerName = caps.email ?? "Your Datung seller";

  const steps = [
    "Scan the code",
    "Get approved",
    "Buy now, pay later",
  ];

  return (
    <div className="min-h-screen w-full bg-white">
      <style>{`
        @media print {
          @page { margin: 12mm; }
          body { background: #ffffff !important; }
        }
      `}</style>

      <div className="mx-auto max-w-[820px] px-4 py-6">
        <div className="mb-5 flex justify-center print:hidden">
          <PrintButton />
        </div>

        <div className="mx-auto max-w-[820px] rounded-2xl border border-black/10 bg-white p-10 text-center sm:p-14">
          <div className="flex justify-center">
            <Wordmark markClassName="h-9 w-auto" />
          </div>

          <h1 className="mt-8 text-5xl font-bold tracking-tight text-brand-900 sm:text-6xl">
            Shop now, pay later
          </h1>
          <p className="mt-3 text-lg text-black/60">
            Scan to sign up for Datung credit
          </p>

          <div className="mt-8 flex justify-center">
            <div
              style={{ width: 320, height: 320 }}
              className="rounded-2xl border border-black/10 bg-white p-4 [&>svg]:h-full [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
          </div>

          <ol className="mx-auto mt-10 grid max-w-xl gap-4 sm:grid-cols-3">
            {steps.map((step, i) => (
              <li key={step} className="flex flex-col items-center gap-2">
                <span className="flex size-9 items-center justify-center rounded-full bg-brand-700 text-base font-bold text-white">
                  {i + 1}
                </span>
                <span className="text-sm font-medium text-brand-900">{step}</span>
              </li>
            ))}
          </ol>

          <p className="mt-10 text-sm text-black/55">
            Invited by <span className="font-medium text-brand-800">{sellerName}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
