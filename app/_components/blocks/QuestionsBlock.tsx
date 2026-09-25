// Block 7 of 8 -- FAQ. Renders only with 3+ real questions, so a business
// with one or two confirmed answers doesn't get a half-empty-looking FAQ
// section -- it gets none, until there are enough for it to be worth a
// visitor's time.
type Faq = { question: string; answer: string; linkUrl?: string | null; linkLabel?: string | null };

export function QuestionsBlock({ faqs }: { faqs: Faq[] }) {
  if (faqs.length < 3) return null;
  return (
    <section className="tpl-questions" aria-label="Frequently asked questions">
      {faqs.map((faq) => (
        <details key={faq.question}>
          <summary>{faq.question}<span aria-hidden="true">+</span></summary>
          <p>
            {faq.answer}
            {faq.linkUrl && (
              <>
                {" "}
                <a href={faq.linkUrl} target="_blank" rel="noopener noreferrer">{faq.linkLabel ?? "Learn more"} <span aria-hidden="true">↗</span></a>
              </>
            )}
          </p>
        </details>
      ))}
    </section>
  );
}
