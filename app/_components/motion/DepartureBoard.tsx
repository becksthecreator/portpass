import { BoardFlicker } from "./BoardFlicker";

// The Departure Board (brief 22, M3): a numbers strip under the homepage's
// hero, with counts the page already reads. Only real numbers: a count of
// 0 is left out rather than shown, and with nothing to show the strip is
// not drawn. The true values are in this HTML (each digit in a fixed-width
// cell) and in the strip's aria-label; BoardFlicker only plays the
// split-flap flicker over them once, in a browser that may move.
export type BoardCount = {
  value: number;
  // The visible label, singular and plural: ["Business open", "Businesses open"].
  label: [string, string];
};

export function DepartureBoard({ counts }: { counts: BoardCount[] }) {
  const shown = counts.filter((count) => Number.isInteger(count.value) && count.value > 0);
  if (!shown.length) return null;
  const said = shown.map((count) => `${count.value} ${(count.value === 1 ? count.label[0] : count.label[1]).toLowerCase()}`);
  return (
    <section className="board" aria-label={`PortPass today: ${said.join(", ")}`}>
      <BoardFlicker>
        <ul className="board-list">
          {shown.map((count, index) => (
            <li className="board-item" key={count.label[1]}>
              <span className="board-value" aria-hidden="true">
                {String(count.value)
                  .split("")
                  .map((digit, i) => (
                    <span className="board-cell" data-final={digit} key={i}>
                      {digit}
                    </span>
                  ))}
              </span>
              <span className="board-label" aria-hidden="true">
                {count.value === 1 ? count.label[0] : count.label[1]}
              </span>
              <span className="sr-only">{said[index]}</span>
            </li>
          ))}
        </ul>
      </BoardFlicker>
    </section>
  );
}
