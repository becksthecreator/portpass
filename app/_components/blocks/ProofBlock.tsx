// Block 2 of 8 -- renders only when at least one value is true. Never
// invents a number: an organization with nothing confirmed yet (no years,
// no rating, no awards) simply skips this block entirely.
export function ProofBlock({
  yearsInBusiness,
  rating,
  reviewCount,
  awards,
}: {
  yearsInBusiness: number | null;
  rating: number | null;
  reviewCount: number | null;
  awards: string[];
}) {
  const items: { value: string; label: string }[] = [];
  if (yearsInBusiness) items.push({ value: `${yearsInBusiness}+`, label: "Years in business" });
  if (rating !== null) items.push({ value: rating.toFixed(1), label: reviewCount ? `${reviewCount} reviews` : "Rating" });
  else if (reviewCount) items.push({ value: String(reviewCount), label: "Reviews" });
  if (awards.length === 1) items.push({ value: "1", label: awards[0] });
  else if (awards.length > 1) items.push({ value: String(awards.length), label: "Awards & recognition" });

  if (items.length === 0) return null;

  return (
    <section className="tpl-proof" aria-label="Trust and experience">
      {items.map((item) => (
        <div key={item.label}>
          <strong>{item.value}</strong>
          <span>{item.label}</span>
        </div>
      ))}
    </section>
  );
}
