// The three taps (brief 27, C): Pick, Who, Done. Shared by the Saturday
// registration and the private-session form so both read the same way.
// Plain markup, no motion.
const STEPS = ["Pick", "Who", "Done"] as const;

export function TapProgress({ step }: { step: 1 | 2 | 3 }) {
  return (
    <ol className="tap-progress" aria-label="Steps">
      {STEPS.map((label, index) => {
        const number = (index + 1) as 1 | 2 | 3;
        return (
          <li key={label} className={number < step ? "is-done" : number === step ? "is-current" : ""} aria-current={number === step ? "step" : undefined}>
            <span>{number}</span>{label}
          </li>
        );
      })}
    </ol>
  );
}
