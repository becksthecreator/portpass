// Block 5 of 8 -- when, where, ages, capacity, what to bring. The block
// itself just lays out fact rows; the template (Organization vs. a single
// Program/Event/Venue/Service page) decides which facts are worth showing,
// since "when" means something different for one offering than for an
// organization running several.
export function PracticalBlock({ facts }: { facts: { label: string; value: string }[] }) {
  if (facts.length === 0) return null;
  return (
    <section className="tpl-practical" aria-label="Practical details">
      {facts.map((fact) => (
        <div className="tpl-practical-fact" key={fact.label}>
          <b>{fact.label}</b>
          <span>{fact.value}</span>
        </div>
      ))}
    </section>
  );
}
