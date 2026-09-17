export { default, metadata } from "./bahamas-by-the-sea/page";

// Route segment config is statically analyzed per file by Next.js, so this
// has to be re-declared here rather than relying on the re-export above.
export const dynamic = "force-dynamic";
