import { ViewTransition, type ReactNode } from "react";

// How a main public page (home, a section, pricing, about) arrives and
// leaves on a client navigation (brief 22, M4), keyed by the type the
// link carries:
//   "card"  a section card or a subsection chip: a --dur-page cross-fade
//   "tide"  the header's and footer's links between main pages: the Tide
//           Wipe (lib/motion/public.css)
// Anything else (Back, Forward, every other link) has no type and swaps at
// once. React's <ViewTransition> comes with the App Router's React; a
// browser without the View Transitions API simply navigates.
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition
      enter={{ tide: "tide-in", card: "page-in", default: "none" }}
      exit={{ tide: "tide-out", card: "page-out", default: "none" }}
      default="none"
    >
      {children}
    </ViewTransition>
  );
}

// A shared element: the same name on the page being left and the one
// arriving morphs one into the other, on a "card" move only.
export function SharedElement({ name, children }: { name: string; children: ReactNode }) {
  return (
    <ViewTransition name={name} share={{ card: "morph", default: "none" }} default="none">
      {children}
    </ViewTransition>
  );
}

// The transition type a link carries.
export const TIDE: string[] = ["tide"];
export const CARD: string[] = ["card"];
