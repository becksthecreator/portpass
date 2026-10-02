import Link from "next/link";
import type { ReactNode } from "react";
import { parseGuideBody, type GuideInline } from "@/lib/guides";

// A guide's words as React elements: never HTML from the database.
function inline(parts: GuideInline[]): ReactNode[] {
  return parts.map((part, index) => {
    if (part.kind === "bold") return <strong key={index}>{part.text}</strong>;
    if (part.kind === "link") {
      return part.external
        ? <a key={index} href={part.href} target="_blank" rel="noopener noreferrer">{part.text}</a>
        : <Link key={index} href={part.href}>{part.text}</Link>;
    }
    return <span key={index}>{part.text}</span>;
  });
}

export function GuideBody({ body }: { body: string }) {
  return (
    <div className="guide-body">
      {parseGuideBody(body).map((block, index) => {
        if (block.kind === "ul") return <ul key={index}>{block.items.map((item, i) => <li key={i}>{inline(item)}</li>)}</ul>;
        if (block.kind === "h2") return <h2 key={index}>{inline(block.parts)}</h2>;
        if (block.kind === "h3") return <h3 key={index}>{inline(block.parts)}</h3>;
        return <p key={index}>{inline(block.parts)}</p>;
      })}
    </div>
  );
}
