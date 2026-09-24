import { NextResponse } from "next/server";
import { currentWeddingStaffRole } from "@/app/weddings/staff-auth";
import { getWeddingSiteSettings, updateWeddingSiteSettings } from "@/db/weddingSite";

export async function POST(request: Request) {
  const role = await currentWeddingStaffRole();
  if (!role) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    reviewCount?: number;
    reviewRecommendPct?: number;
    yearsExperience?: number;
    awardYears?: string;
    reviewsWidgetHtml?: string;
    ratingBadgeHtml?: string;
    awardBadgeHtml?: string;
  };

  const awardYears = String(body.awardYears ?? "")
    .split(",")
    .map((y) => Number(y.trim()))
    .filter((y) => Number.isInteger(y));

  try {
    await updateWeddingSiteSettings({
      reviewCount: Number(body.reviewCount) || 0,
      reviewRecommendPct: Number(body.reviewRecommendPct) || 0,
      yearsExperience: Number(body.yearsExperience) || 0,
      awardYears,
      reviewsWidgetHtml: body.reviewsWidgetHtml ?? null,
      ratingBadgeHtml: body.ratingBadgeHtml ?? null,
      awardBadgeHtml: body.awardBadgeHtml ?? null,
    });
    return NextResponse.json({ settings: await getWeddingSiteSettings() });
  } catch (error) {
    console.error("Wedding site settings save error", error);
    return NextResponse.json({ error: "Could not save site content." }, { status: 500 });
  }
}
