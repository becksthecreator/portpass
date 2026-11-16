import { NextResponse } from "next/server";
import { currentFutprepStaffAccount, currentFutprepStaffName, currentFutprepStaffRole } from "@/app/futprep/staff-auth";
import { classRecipients, createClassPost, findFeedClass, listClassPosts, recordEmailed, removeClassPost } from "@/db/classFeed";
import { afterResponse } from "@/lib/afterResponse";
import { bodyOf, readJson } from "@/lib/api/body";
import { checkPostBody, classPostEmail } from "@/lib/classFeed";
import { sendEmail } from "@/lib/email";
import { absoluteUrl } from "@/lib/seo/jsonLd";

// The class feed, staff side. Coaches, admins and the CEO post; a helper
// login can't. The class must be Futprep's (db/classFeed.ts findFeedClass).

async function poster() {
  const role = await currentFutprepStaffRole();
  if (!role || role === "helper") return null;
  const account = await currentFutprepStaffAccount();
  if (!account) return null;
  return { account, name: (await currentFutprepStaffName()) ?? "" };
}

const denied = () => NextResponse.json({ error: "Staff access required." }, { status: 403 });
const id = (value: unknown) => (typeof value === "number" ? value : Number(value));

export async function GET(request: Request) {
  if (!(await poster())) return denied();
  const url = new URL(request.url);
  const programId = id(url.searchParams.get("programId"));
  const termId = id(url.searchParams.get("termId"));
  if (!(await findFeedClass(programId, termId))) return NextResponse.json({ error: "Pick a class." }, { status: 400 });
  return NextResponse.json({ posts: await listClassPosts(programId, termId) });
}

// Resend takes about two requests a second on this plan: a short pause
// between parents keeps a class of 40 well inside it.
const PAUSE_MS = 600;
const pause = () => new Promise((resolve) => setTimeout(resolve, PAUSE_MS));

export async function POST(request: Request) {
  const who = await poster();
  if (!who) return denied();
  const read = await readJson(request, bodyOf(["programId", "termId", "body", "notify"]));
  if (!read.ok) return read.response;
  const { programId, termId, notify } = read.value;

  const checked = checkPostBody(read.value.body);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  const found = await findFeedClass(id(programId), id(termId));
  if (!found) return NextResponse.json({ error: "Pick a class." }, { status: 400 });

  let post;
  try {
    post = await createClassPost({ programId: id(programId), termId: id(termId), body: checked.body, authorAccount: who.account, authorName: who.name });
  } catch (error) {
    console.error("class post error", error instanceof Error ? error.message : "");
    return NextResponse.json({ error: "Could not post the update. Try again." }, { status: 500 });
  }

  const recipients = notify === false ? [] : await classRecipients(post.programId, post.termId);
  if (recipients.length) {
    const { subject, html } = classPostEmail({
      programName: found.programName,
      termName: found.termName,
      authorName: who.name,
      body: post.body,
      feedUrl: absoluteUrl("/futprep/feed"),
    });
    afterResponse(async () => {
      let sent = 0;
      for (const [index, to] of recipients.entries()) {
        if (index) await pause();
        const outcome = await sendEmail({ to, subject, html, log: { template: "futprep_class_post", organizationId: found.organizationId } });
        if (outcome === "sent") sent += 1;
      }
      await recordEmailed(post.id, sent);
    });
  }

  return NextResponse.json({ post, emailing: recipients.length });
}

export async function DELETE(request: Request) {
  const who = await poster();
  if (!who) return denied();
  const read = await readJson(request, bodyOf(["postId"]));
  if (!read.ok) return read.response;
  const removed = await removeClassPost(id(read.value.postId), who.account);
  if (!removed) return NextResponse.json({ error: "That update was already removed." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
