// A plain list of what a business offers, as tags -- not offerings with
// prices (that's OfferingsBlock), just the breadth of what they do. Renders
// only with a real list; an empty array means the business hasn't
// supplied one yet, not that the section should show empty.
export function ServicesBlock({ services }: { services: string[] }) {
  if (services.length === 0) return null;
  return (
    <section className="tpl-services" aria-label="Services offered">
      <h2>What we help with</h2>
      <ul className="tpl-services-list">
        {services.map((service) => (
          <li key={service}>{service}</li>
        ))}
      </ul>
    </section>
  );
}
