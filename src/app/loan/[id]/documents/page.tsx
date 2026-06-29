import Link from "next/link";
import { redirect } from "next/navigation";
import { getCapabilities } from "@/lib/profiles/capabilities";
import { getLoanDocuments } from "@/lib/legal/acceptance";
import type { LoanDocData } from "@/lib/legal/types";
import { formatDateTime } from "@/lib/format";
import DisclosureStatement from "@/components/legal/DisclosureStatement";
import PromissoryNote from "@/components/legal/PromissoryNote";

export const dynamic = "force-dynamic";

/**
 * A loan's legal documents (Disclosure Statement + Promissory Note), rendered
 * from the borrower's recorded acceptance snapshot. Visible to the borrower who
 * took the loan and to staff. Clean, print-friendly layout (no app chrome).
 */
export default async function LoanDocumentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const caps = await getCapabilities();
  if (!caps) redirect(`/login?next=${encodeURIComponent(`/loan/${id}/documents`)}`);

  const docs = await getLoanDocuments(id);
  if (!docs) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16 text-center text-sm text-black/60">
        This loan was not found.
      </main>
    );
  }

  // Only the borrower or staff may view a loan's documents.
  const allowed = caps.userId === docs.buyerUserId || Boolean(caps.staffRole);
  if (!allowed) redirect("/dashboard");

  const data: LoanDocData = {
    loanRef: `DK-${docs.loanId.slice(0, 8).toUpperCase()}`,
    date: docs.date.slice(0, 10),
    borrower: {
      name: docs.borrowerName || "Borrower",
      contact: docs.borrowerContact,
    },
    terms: docs.terms,
    purchaseDescription: docs.sellerName
      ? `Purchase from ${docs.sellerName}`
      : null,
  };

  return (
    <main className="min-h-screen bg-black/[0.04] py-8">
      <div className="mx-auto mb-4 flex max-w-3xl items-center justify-between px-6 print:hidden">
        <Link
          href="/dashboard"
          className="text-sm font-medium text-brand-700 underline-offset-4 hover:underline"
        >
          ← Back
        </Link>
        {docs.acceptance ? (
          <span className="text-xs text-black/55">
            Accepted by {docs.acceptance.signatureName} on{" "}
            {formatDateTime(docs.acceptance.acceptedAt)} · v
            {docs.acceptance.documentVersion}
            {docs.acceptance.ipAddress ? ` · IP ${docs.acceptance.ipAddress}` : ""}
          </span>
        ) : (
          <span className="text-xs text-amber-700">
            No recorded acceptance for this loan (booked before e-signature
            capture).
          </span>
        )}
      </div>

      <div className="space-y-8">
        <div className="print:break-after-page">
          <DisclosureStatement data={data} />
        </div>
        <PromissoryNote data={data} />
      </div>
    </main>
  );
}
