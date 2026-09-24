// Block 6 of 8 -- photo, name, paragraph. Renders only when there's a real
// bio; a photo is a bonus, not a requirement, since a confirmed bio can
// exist before a headshot does. `credentials` is optional, plain text
// under the name (e.g. licences, degrees) -- not every business has them,
// but any business could.
export function PeopleBlock({
  name,
  bio,
  imageUrl,
  credentials,
  contactPhone,
  contactEmail,
}: {
  name: string | null;
  bio: string | null;
  imageUrl?: string | null;
  credentials?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
}) {
  if (!name || !bio) return null;
  return (
    <section className="tpl-people" aria-label="Meet the team">
      {imageUrl && <img className="tpl-people-image" src={imageUrl} alt={name} loading="lazy" />}
      <div className="tpl-people-copy">
        <h3>{name}</h3>
        {credentials && <p className="tpl-people-credentials">{credentials}</p>}
        <p>{bio}</p>
        {(contactPhone || contactEmail) && (
          <p className="tpl-people-contact">
            {contactPhone && <a href={`tel:${contactPhone.replace(/[^+\d]/g, "")}`}>{contactPhone}</a>}
            {contactPhone && contactEmail && " · "}
            {contactEmail && <a href={`mailto:${contactEmail}`}>{contactEmail}</a>}
          </p>
        )}
      </div>
    </section>
  );
}
