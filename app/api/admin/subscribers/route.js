import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withRetry } from "@/lib/withRetry";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

// GET -> every account straight from the database, newest first, with its
// payments. The admin page filters (active / expired / never paid) on the
// client. Because it is read live on every load, an account deleted by the
// daily cleanup simply stops appearing — there is no separate list to sync.
export async function GET(req) {
  const { admin, response } = await requireAdmin(req);
  if (response) return response;

  try {
    const users = await withRetry(() =>
      prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        take: 5000,
        select: {
          id: true,
          email: true,
          name: true,
          createdAt: true,
          subscriptionExpires: true,
          readingsUsed: true,
          orders: {
            where: { status: { in: ["paid", "refunded"] } },
            orderBy: { createdAt: "asc" },
            select: { id: true, razorpayOrderId: true, amount: true, status: true, createdAt: true },
          },
        },
      })
    );

    const now = new Date();
    const rows = users.map((u) => {
      const paid = u.orders.filter((o) => o.status === "paid");
      const exp = u.subscriptionExpires;
      return {
        id: u.id,
        email: u.email,
        name: u.name,
        signedUpAt: u.createdAt,
        subscribedAt: u.orders[0]?.createdAt || null, // first payment ever
        lastPaidAt: paid[paid.length - 1]?.createdAt || null,
        validTill: exp,
        status: exp ? (exp > now ? "active" : "expired") : "none",
        totalPaidInr: paid.reduce((s, o) => s + o.amount, 0) / 100,
        readingsUsed: u.readingsUsed,
        orders: u.orders.map((o) => ({
          id: o.id,
          razorpayOrderId: o.razorpayOrderId,
          amountInr: o.amount / 100,
          status: o.status,
          createdAt: o.createdAt,
        })),
      };
    });

    return NextResponse.json({ admin: admin.email, now, rows });
  } catch (err) {
    console.error("admin subscribers failed:", err);
    Sentry.captureException(err, { tags: { area: "admin-subscribers" } });
    return NextResponse.json({ error: "Couldn't load subscribers." }, { status: 500 });
  }
}
