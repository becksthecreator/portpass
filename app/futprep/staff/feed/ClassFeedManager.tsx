"use client";

import { useState, type FormEvent } from "react";
import { canRemovePost } from "@/lib/classFeed";

type FeedClass = { programId: number; termId: number; programName: string; termName: string; families: number };
type Post = { id: number; body: string; authorAccount: string; authorName: string; emailedCount: number; createdAt: string };

const MAX = 2000;
const keyOf = (c: { programId: number; termId: number }) => `${c.programId}:${c.termId}`;
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Nassau" });

// Pick a class, write, post. The server checks the class is Futprep's and
// takes the author from the login.
export function ClassFeedManager({ classes, initialKey, initialPosts, viewer }: { classes: FeedClass[]; initialKey: string; initialPosts: Post[]; viewer: { role: string; account: string } }) {
  const [key, setKey] = useState(initialKey);
  const [posts, setPosts] = useState(initialPosts);
  const [body, setBody] = useState("");
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const current = classes.find((c) => keyOf(c) === key) ?? classes[0];

  async function pick(next: string) {
    setKey(next);
    setError("");
    setMessage("");
    const chosen = classes.find((c) => keyOf(c) === next);
    if (!chosen) return;
    const response = await fetch(`/api/futprep/staff/class-posts?programId=${chosen.programId}&termId=${chosen.termId}`).catch(() => null);
    const data = response ? ((await response.json().catch(() => ({}))) as { posts?: Post[]; error?: string }) : { error: "No connection. Try again." };
    if (!response?.ok || !data.posts) return setError(data.error ?? "Could not load the updates.");
    setPosts(data.posts);
  }

  async function post(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    const response = await fetch("/api/futprep/staff/class-posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ programId: current.programId, termId: current.termId, body, notify }),
    }).catch(() => null);
    const data = response ? ((await response.json().catch(() => ({}))) as { post?: Post; emailing?: number; error?: string }) : { error: "No connection. Try again." };
    setBusy(false);
    if (!response?.ok || !data.post) return setError(data.error ?? "Could not post the update.");
    setPosts((list) => [data.post!, ...list]);
    setBody("");
    const n = data.emailing ?? 0;
    setMessage(n ? `Posted. Emailing ${n} ${n === 1 ? "family" : "families"} now.` : "Posted. No email sent.");
  }

  async function remove(id: number) {
    if (!window.confirm("Remove this update? Parents won't see it on their page any more. Emails already sent can't be taken back.")) return;
    setError("");
    const response = await fetch("/api/futprep/staff/class-posts", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postId: id }) }).catch(() => null);
    if (!response?.ok) return setError("Could not remove it. Try again.");
    setPosts((list) => list.filter((p) => p.id !== id));
  }

  return (
    <div className="class-feed">
      <label className="class-feed-pick">
        <span>Class</span>
        <select value={key} onChange={(e) => pick(e.target.value)}>
          {classes.map((c) => (
            <option key={keyOf(c)} value={keyOf(c)}>
              {c.programName} · {c.termName} ({c.families} {c.families === 1 ? "family" : "families"})
            </option>
          ))}
        </select>
      </label>

      <form className="team-manager-card class-feed-form" onSubmit={post}>
        <label htmlFor="class-feed-body"><strong>Update for {current.programName}</strong></label>
        <p className="class-feed-warning">Don&rsquo;t write a child&rsquo;s health, allergy or medical details here. Every family in the class reads it.</p>
        <textarea id="class-feed-body" value={body} onChange={(e) => setBody(e.target.value)} rows={6} maxLength={MAX} placeholder="e.g. No class this Saturday because of the rain. See you next week." required />
        <div className="class-feed-row">
          <label className="class-feed-check">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
            Email the {current.families} {current.families === 1 ? "family" : "families"} too
          </label>
          <span className="class-feed-count">{body.length}/{MAX}</span>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        {message && <p className="coach-manager-message" role="status">{message}</p>}
        <button className="primary-button" type="submit" disabled={busy || !body.trim()}>{busy ? "Posting…" : "Post update"}</button>
      </form>

      <section aria-labelledby="class-feed-past">
        <h2 id="class-feed-past" className="class-feed-heading">Posted to this class</h2>
        {posts.length === 0 ? (
          <p className="class-feed-empty">Nothing posted to this class yet.</p>
        ) : (
          <ol className="class-feed-list">
            {posts.map((p) => (
              <li key={p.id} className="team-manager-card">
                <div className="class-feed-meta">
                  <span>{when(p.createdAt)}{p.authorName ? ` · ${p.authorName}` : ""}</span>
                  <span>{p.emailedCount ? `Emailed to ${p.emailedCount}` : "Not emailed"}</span>
                </div>
                <p className="class-feed-body">{p.body}</p>
                {canRemovePost(viewer.role, viewer.account, p.authorAccount) && <button type="button" className="class-feed-remove" onClick={() => remove(p.id)}>Remove</button>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
