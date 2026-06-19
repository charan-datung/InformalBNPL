import { type NextRequest, NextResponse } from "next/server";
import { getCurrentStaff } from "@/lib/auth/staff";
import { computeMetrics } from "@/lib/metrics/compute";
import { metricToCsv, type MetricName } from "@/lib/metrics/csv";

export const dynamic = "force-dynamic";

const VALID: MetricName[] = [
  "funnel",
  "outcomes",
  "disputes",
  "sellers",
  "durations",
];

/**
 * CSV export for a metric. Route handlers don't run through the operator layout
 * gate, so we enforce staff access here at the data layer.
 */
export async function GET(request: NextRequest) {
  const staff = await getCurrentStaff();
  if (!staff) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const which = request.nextUrl.searchParams.get("metric") as MetricName | null;
  if (!which || !VALID.includes(which)) {
    return NextResponse.json(
      { error: `metric must be one of: ${VALID.join(", ")}` },
      { status: 400 },
    );
  }

  const metrics = await computeMetrics();
  const csv = metricToCsv(metrics, which);
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="metrics-${which}-${stamp}.csv"`,
    },
  });
}
