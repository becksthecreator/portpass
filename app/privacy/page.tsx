import Link from "next/link";
import { AttorneyReviewNote, LegalChangelog, LegalVersionLine } from "@/app/_components/LegalParts";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { PORTPASS_PHONE_DISPLAY, PORTPASS_PHONE_E164, PORTPASS_SUPPORT_EMAIL } from "@/lib/contact";
import { PRIVACY_POLICY } from "@/lib/legal";

// ISR: the header shows live counts from the database, so a static page
// regenerates every five minutes rather than only at deploy time.
export const revalidate = 300;

export const metadata = {
  title: "Privacy Policy | PortPass Bahamas",
  description: "What PortPass Bahamas collects, why, who can see it, how long we keep it and what you can ask us to do with it.",
};

// Privacy Policy v2 (brief 16 D, brief 07). Written for PortPass accounts,
// Google sign-in and children's programmes, with the retention periods
// Antonio approved. Every statement on this page was checked against what
// the code does on 1 Oct 2026 (cookies, storage, emails, who sees health
// details, what is deleted and when). Change the code and this page
// together. The version, date and changelog live in lib/legal.ts.
export default function PrivacyPage() {
  return (
    <main className="form-page">
      <SiteHeader breadcrumb={[{ label: "Privacy", href: "/privacy" }]} />
      <section className="form-intro">
        <LegalVersionLine doc={PRIVACY_POLICY} />
        <h1>Privacy Policy.</h1>
        <p>
          PortPass Bahamas Technologies (“PortPass”, “we”, “us”) runs portpassbahamas.com, the booking pages of the businesses listed on it, and PortPass accounts. This policy says what we collect, why, who can see it, how long we keep it, and what you can ask us to do with it.
        </p>
      </section>
      <article className="legal-body">
        <AttorneyReviewNote />

        <h2>The law we follow</h2>
        <p>
          We handle personal information in line with the Data Protection (Privacy of Personal Information) Act (Chapter 324A of the laws of The Bahamas), passed in 2003. Parliament has also passed the Data Protection Act, 2025, which replaces the 2003 Act on a date the Government has yet to set. We will follow it from that date and update this page.
        </p>
        <p>
          When you book with a business on PortPass, that business decides what it needs to know about you, and it is responsible for its own customer records. PortPass stores those records for the business and protects them as this policy describes. For PortPass accounts and for this website, PortPass is responsible.
        </p>

        <h2>What we collect, and when</h2>
        <p>
          <strong>When you register, book or enquire.</strong> We collect what you type into the form: your name, email address and phone number, and the details that booking needs, such as dates, guest numbers, the class or package you chose and how you plan to pay. You don’t need an account to enquire or to register a child.
        </p>
        <p>
          <strong>When you create a PortPass account.</strong> Your name, your email address and, if you give it, your phone number. You sign in with a 6-digit code sent to your email, or with Google. There are no passwords, so we store none. If you booked earlier with the same email address, we link those bookings to your account.
        </p>
        <p id="google">
          <strong>When you sign in with Google.</strong> If you choose “Continue with Google”, Google shares three things with us: your name, your email address and your profile photo. We use your name and email address to create or find your PortPass account. We don’t use or show the photo; it stays with your sign-in record. We ask Google for nothing else, so we can’t see your contacts, calendar, files or anything else in your Google account, and PortPass never posts anything to Google or on your behalf. You can remove PortPass’s access at any time in your Google account settings.
        </p>
        <p>
          <strong>When you run a business on PortPass.</strong> Your business details (name, section, contact details, photos, prices and payment methods), the names, email addresses and roles of the people you add to your team, and the bank-transfer details you give us for your customers. We keep a log of changes to roles, approvals and payment details: who changed what, when, and the values before and after.
        </p>
        <p>
          <strong>When you ask to be listed.</strong> Your name, business name, section, WhatsApp number, Instagram handle if you give one, and a short note.
        </p>
        <p>
          <strong>When you work for a business on PortPass.</strong> Your name, your role, and a staff sign-in. Your PIN itself is not stored, only a scrambled form of it. For coaches, the business may also record a public profile (name, photo, short biography), the sessions you worked and what you are owed for them.
        </p>
        <p>
          <strong>How you found us.</strong> If you reach a business’s page through a link or QR code that carries a campaign tag, or you answer “How did you hear about us?”, we save that with your registration. It tells the business and PortPass which materials work, and whether a new customer came through PortPass. It is saved against your registration, so it is linked to you. It is never used to follow you around the web.
        </p>
        <p>
          <strong>Payments.</strong> PortPass does not take card payments, and we never collect or store card numbers. You pay the business directly, by cash or bank transfer. The business’s staff then record the amount, the method, the date, any reference and who recorded it.
        </p>

        <h2 id="children">Children’s information</h2>
        <p>
          Some businesses on PortPass run programmes for children. A parent or guardian registers the child and signs the consent. We never ask a child for information, and children don’t hold accounts.
        </p>
        <p>
          <strong>What we collect about a child.</strong> Name, date of birth and gender; an emergency contact and who may collect the child; your choice about photos and video; and the health details you choose to give: allergies, medical conditions, medications, special needs and anything you add in the notes box. The health details are optional.
        </p>
        <p>
          <strong>Why.</strong> Only to run that programme safely: to place the child in the right class, to take attendance, and so the coach on the field knows what to do in an emergency.
        </p>
        <p>
          <strong>Who can see a child’s health details.</strong> Only that business’s own staff who need them: the coaches running the session and the staff on its registration desk. A helper who only checks the roster is not sent them. Health details are never included in spreadsheets or exports, in any email, on any public page, in the status page you open with your reference code, or in your PortPass account. PortPass’s own team does not read them in the ordinary running of the service; the founders can reach the database to maintain it, and do so only to fix a fault or at the business’s request.
        </p>
        <p>
          <strong>Emergency contacts and pickup names</strong> are seen by the same staff. They are also filled in for you if the business sends you a personal link to register again next term, so anyone you forward that link to can see them. Health details are never filled in from an earlier registration; we ask for them fresh each time.
        </p>
        <p>
          <strong>Records the business starts.</strong> Sometimes the business begins a child’s record before you do: a coach may add a child’s name at the field, and a business moving to PortPass may bring over the records it already holds. You then complete and sign the registration yourself.
        </p>
        <p>
          <strong>Photos.</strong> You choose yes or no to photos and video when you register. We never ask you to upload a photo of your child. A sports business may only publish a photo on PortPass after it confirms it holds consent for every child in that photo.
        </p>
        <p>
          <strong>How long.</strong> A child’s health details are deleted 90 days after the programme they registered for ends. See “How long we keep it” below.
        </p>

        <h2>How we use it</h2>
        <p>
          To handle your enquiry, registration or booking; to put you in touch with the business; to send you messages about that booking; to sign you in; to let a business run its listing, its team and its records; and to answer questions you send us.
        </p>
        <p>
          <strong>Emails we send.</strong> Your sign-in code. For a child’s registration: that it was received, that a payment was recorded, and that it was confirmed. For a private session: that a coach accepted it, with the time, place and how to pay. These emails carry names, the class, amounts and your reference code. They never carry health or emergency details.
        </p>
        <p>
          We do not sell your information. We do not use it for advertising. We do not send marketing emails.
        </p>

        <h2>Who we share it with</h2>
        <p>
          <strong>The business you book with</strong> sees the details of your booking. That is the point of the booking.
        </p>
        <p>
          <strong>Companies that run PortPass for us.</strong> They receive information only so they can provide their service to us:
        </p>
        <ul>
          <li><strong>Supabase:</strong> our database, sign-in and photo storage.</li>
          <li><strong>Vercel:</strong> website hosting. Every form you send passes through its servers, and its logs can hold an email address when an email fails to send.</li>
          <li><strong>Resend:</strong> sends our emails, so it handles the address, subject and text of each one.</li>
          <li><strong>Google:</strong> only if you choose to sign in with Google.</li>
          <li><strong>Microsoft Outlook:</strong> our own inbox, where requests to be listed and emails you send us arrive.</li>
        </ul>
        <p>
          <strong>WhatsApp.</strong> WhatsApp buttons on PortPass open WhatsApp on your own device with a message you can edit. Nothing is sent unless you send it. The message then goes through WhatsApp, not through PortPass, and WhatsApp’s own terms apply. A business’s staff may also message you on WhatsApp at the number you gave them.
        </p>
        <p>
          <strong>Review badges.</strong> One listing, Bahamas Weddings By The Sea, shows its rating and reviews using WeddingWire’s own badge. On that page your browser loads it from WeddingWire, which can see your internet address and may set its own cookies.
        </p>
        <p>
          <strong>Where it is kept.</strong> Our providers store and process information in the United States. By using PortPass you agree to your information being sent there. Photos a business or coach uploads for its public page are stored at public web addresses.
        </p>
        <p>
          We may also disclose information when the law requires us to.
        </p>

        <h2 id="cookies">Cookies and what is kept on your device</h2>
        <p>
          PortPass sets a small number of cookies, all of them its own:
        </p>
        <ul>
          <li><strong>Sign-in:</strong> keeps you signed in to your PortPass account until you sign out.</li>
          <li><strong>Last place:</strong> remembers which part of PortPass you opened last, for up to a year. It is removed when you sign out.</li>
          <li><strong>Staff sign-in:</strong> keeps a business’s staff signed in to their staff area for up to 12 hours.</li>
          <li><strong>Administrator check:</strong> remembers for up to 12 hours that a PortPass administrator passed the second sign-in step.</li>
          <li><strong>How you found a business:</strong> on a business’s pages, if you arrived from a tagged link or another website, a cookie remembers the campaign tags and the name of that website for 30 days, so it can be saved with your registration. It holds no name and no identifier.</li>
        </ul>
        <p>
          Your browser also keeps a few things that never leave your device: whether you closed the “get the app” banner, whether you have seen the opening animation, and copies of public pages you opened so they still open offline. Pages that show or collect personal information are not saved offline. On a coach’s phone, attendance marks wait on the device until they are saved; they hold no names.
        </p>
        <p>
          There are no advertising cookies and no trackers that follow you to other websites. To count visits and measure page speed we may switch on Vercel’s Web Analytics and Speed Insights. They set no cookies and are not used to identify you. When they are on, they record which pages are opened across the whole site.
        </p>
        <p>
          We use your internet (IP) address only for a few minutes, to slow down repeated attempts on our forms. We do not save it in our database.
        </p>

        <h2 id="retention">How long we keep it</h2>
        <ul>
          <li><strong>Children’s health details</strong> (allergies, medical conditions, medications, special needs and the notes box): deleted automatically 90 days after the programme ends, together with any earlier versions kept in the record’s edit history.</li>
          <li><strong>Payment records:</strong> 7 years.</li>
          <li><strong>Enquiries that don’t become a booking</strong> (wedding enquiries, “tell me when this opens”, and requests to be listed): 2 years.</li>
          <li><strong>Registrations and bookings</strong> (names, contact details, class, attendance): kept as the business’s record while you are its customer, and for up to 7 years where a payment was recorded.</li>
          <li><strong>PortPass accounts:</strong> until you ask us to delete the account.</li>
          <li><strong>Sign-in codes:</strong> they expire within minutes.</li>
          <li><strong>The log of changes</strong> to roles, approvals and payment details: for as long as the business is on PortPass.</li>
        </ul>
        <p>
          At the end of these periods we delete the information, or remove the names from it so it can no longer be linked to you. When a business’s staff correct a record, the earlier value is kept in an edit history so changes can be traced. Our encrypted backups are each kept for no more than 12 months, so deleted information leaves the backups within that time.
        </p>

        <h2>Your rights</h2>
        <p>
          You can ask us, in writing, what information we hold about you and for a copy of it. You can ask us to correct it, to delete it, or to stop using it in a particular way. Email us at the address below. We may ask you to confirm who you are first. We answer within 30 days. If we can’t do what you ask, for example because the business must keep a payment record, we will tell you why.
        </p>
        <p>
          For a child’s registration, the business’s registration desk can correct the record for you, and each correction is logged.
        </p>
        <p>
          If you are not happy with our answer, you can complain to the Data Protection Commissioner: Office of the Data Protection Commissioner, P.O. Box N-3017, Nassau, The Bahamas; telephone (242) 604-1001; <a href="mailto:dataprotection@bahamas.gov.bs">dataprotection@bahamas.gov.bs</a>; <a href="https://www.dataprotection.gov.bs" rel="noopener noreferrer">dataprotection.gov.bs</a>.
        </p>

        <h2>Deleting your account</h2>
        <p>
          Email us and we will delete your PortPass account. That removes your sign-in and your profile. Registrations and payments already made stay with the business you made them with, as its own records, for the periods above. If you were part of a business’s team, your membership ends; the business’s own information stays with the business.
        </p>

        <h2>How we protect it</h2>
        <p>
          Your browser never talks to the database: every request goes through our own servers, and what each signed-in person may see is decided there, never from anything their browser claims. A business’s staff area has its own sign-in. PortPass’s own administrators need a second step, a code from an authenticator app, before they can open the admin area. Changes to roles, approvals, payment details and children’s records are logged with who made them. Connections to PortPass are encrypted.
        </p>
        <p>
          No system is perfectly secure. If something goes wrong that affects your information, we will tell you and the business concerned.
        </p>

        <h2>Changes to this policy</h2>
        <p>
          When we change this policy we update the version and the date at the top and list what changed at the bottom. If a change affects how we use information you have already given us, we will email you where we have your address.
        </p>

        <h2>Contact us</h2>
        <p>
          PortPass Bahamas Technologies<br />
          Nassau, The Bahamas<br />
          Email: <a href={`mailto:${PORTPASS_SUPPORT_EMAIL}`}>{PORTPASS_SUPPORT_EMAIL}</a><br />
          Phone: <a href={`tel:${PORTPASS_PHONE_E164}`}>{PORTPASS_PHONE_DISPLAY}</a>
        </p>
        <p>
          See also our <Link href="/terms">Terms of Service</Link>.
        </p>

        <LegalChangelog doc={PRIVACY_POLICY} />
      </article>
      <SiteFooter />
    </main>
  );
}
