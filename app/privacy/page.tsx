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
          PortPass Bahamas Technologies (“PortPass”, “we”, “us”) runs portpassbahamas.com, the booking pages of the businesses listed on it, and PortPass accounts. This policy also covers a business’s own website where PortPass runs it. This policy says what we collect, why, who can see it, how long we keep it, and what you can ask us to do with it.
        </p>
      </section>
      <article className="legal-body">
        <AttorneyReviewNote />

        <h2>The law we follow</h2>
        <p>
          We handle personal information in line with the Data Protection (Privacy of Personal Information) Act (Chapter 324A of the laws of The Bahamas), passed in 2003. Parliament has also passed the Data Protection Act, 2025 (No. 74 of 2025), which replaces the 2003 Act on a date the Government has yet to set. We will follow it from that date and update this page.
        </p>
        <p>
          When you book with a business on PortPass, that business decides what it needs to know about you, and it is responsible for its own customer records. PortPass stores those records for the business and protects them as this policy describes. For PortPass accounts and for this website, PortPass is responsible.
        </p>

        <h2>What we collect, and when</h2>
        <p>
          <strong>When you register, book or enquire.</strong> We collect what you type into the form: your name, email address and phone number, and the details that booking needs, such as dates, guest numbers, the class or package you chose and how you plan to pay. You don’t need an account to enquire or to register a child. Only the free taster needs one.
        </p>
        <p>
          <strong>When you create a PortPass account.</strong> Your name, your email address and your phone number. The phone number is optional unless you sign up to run a business. We also record which version of our terms you agreed to and when you last signed in. You sign in with a 6-digit code sent to your email, or with Google where the sign-in page offers it. There are no passwords, so we store none. If you registered a child earlier with the same email address, we link those registrations to your account.
        </p>
        <p id="google">
          <strong>When you sign in with Google.</strong> If you choose “Continue with Google”, Google shares your basic profile with us: your name, your email address and your profile photo, with the ID number Google gives your account. We use your name and email address to create or find your PortPass account. We don’t use or show the photo; it stays with your sign-in record. We ask Google for nothing else. We can’t see your contacts, calendar, files or anything else in your Google account. PortPass never posts anything to Google or on your behalf. You can remove PortPass’s access at any time in your Google account settings.
        </p>
        <p>
          <strong>When you run a business on PortPass.</strong> Your business details (name, section, description, location, contact details, website and Instagram, photos, prices and payment methods); the owner’s name, short biography and photo if you add them; the email addresses and roles of the people you add to your team; and the bank-transfer details you give us for your customers. We keep a log of changes to team invitations, listing approvals and payment details: what changed, when, who made the change, and for payment details the values before and after.
        </p>
        <p>
          <strong>When you ask to be listed.</strong> Your name, business name, section, WhatsApp number, Instagram handle if you give one, and a short note. We also save the plan you picked, if any, and any tag on the link that brought you to the form (it shows which advert or poster you came from).
        </p>
        <p>
          <strong>When we invite a business.</strong> To invite businesses to PortPass, we keep a list of businesses in The Bahamas with the details each one publishes about itself: its name, what it offers, its business phone, WhatsApp, email, website and Instagram page, and its Google rating. These come from Google’s business listings, the business’s own public Instagram page, and what its owner tells us. We never take them from private chats or groups. A founder writes to a business personally, one at a time. If you ask us not to contact your business again, we delete its details and keep only its name, so that we never add it back.
        </p>
        <p>
          <strong>When you work for a business on PortPass.</strong> Your name, your role, an account name and a staff sign-in, the hours and notes you log, and your name on the records you enter. We store a scrambled version of your PIN, not the digits themselves; a PIN is short, so don’t reuse one you use anywhere else. For coaches, the business may also record a public profile (name, nickname, title, photo, short biography, coaching licences, where you played, your favourite player and team, an introduction video and the times you are available), the sessions you worked and what you are owed for them. What you are owed is shown only to you, to the owner of the business and to PortPass’s founders. A coach’s profile may also show a short quote from a customer, with the name the business gives.
        </p>
        <p>
          <strong>How you found us.</strong> When you register we ask “How did you hear about us?”. We save your answer with your registration. We also save any referral code or name you give, the tag on the link or QR code you used (it shows which advert or poster brought you), the name of the website you came from, and whether your family is new to the business. This tells the business and PortPass which materials work, and whether a new customer came through PortPass. PortPass also uses it to work out the fee it invoices the business for customers PortPass brought; you are never charged for this. It is saved against your registration, so it is linked to you. It is never used to follow you around the web. Enquiry and “tell me when this opens” forms also save the tag on the link that brought you.
        </p>
        <p>
          <strong>Payments.</strong> PortPass does not take card payments, and we never collect or store card numbers. You pay the business directly, by cash or bank transfer. The business’s staff then record the amount, the method, the date, any reference and who recorded it.
        </p>

        <h2 id="children">Children’s information</h2>
        <p>
          Some businesses on PortPass run programmes for children. A parent or guardian, or an adult they have authorised, registers the child and signs the consent. We never ask a child for information, and accounts are for adults only.
        </p>
        <p>
          <strong>What we collect about a child.</strong> Name, date of birth and gender; the class they join and their attendance; an emergency contact and who may collect the child; your choice about photos and video; and the health details you choose to give: allergies, medical conditions, medications, special needs and anything you add in the notes box. The health details are optional. The business’s staff can add or correct health details you give them directly. For a private session or a party we ask only for the child’s name and age.
        </p>
        <p>
          <strong>Why.</strong> To run that programme. The business places the child in the right class, takes attendance, keeps track of what has been paid and writes to you about the booking. The coach on the field also needs to know what to do in an emergency. Health details are sensitive: we hold them only because you chose to give them, and they are used only to keep the child safe.
        </p>
        <p>
          <strong>Who can see a child’s health details.</strong> Only that business’s own staff who need them: its coaches, the staff on its registration desk and its owner. A volunteer helper who only ticks names on the class list is not sent them. Health details never appear in a spreadsheet, an export, an email or a public page. They are not on the status page you open with your reference code, and not in your PortPass account. PortPass’s own admin area never shows them. A PortPass founder who also coaches for a business sees them there as one of that business’s coaches. The founders, and the people who maintain the system for them, can reach the database, and do so only to fix a fault or at the business’s request.
        </p>
        <p>
          <strong>Emergency contacts and pickup names</strong> are seen by the same staff. If the business sends you a personal link to register again next term, the link fills in what you gave last time. That is your name, email, phone and relationship to the child; your child’s name, date of birth and gender; the emergency contact; and the pickup names. Anyone you forward that link to can see all of it while early registration is open. A link stops working 120 days after it was made. The business’s staff can also download a class list with names, dates of birth, parents’ contact details and pickup names; it never includes health details. A personal link never fills in health details; we ask for them fresh each time you register.
        </p>
        <p>
          <strong>Records the business starts.</strong> Sometimes the business begins a child’s record before you do. Its staff may add your child’s name, and your name and contact details if they have them. A business moving to PortPass may bring over what it already holds about your child, which can include emergency contacts and health details. You are then sent a link to complete and sign the registration yourself. Where a school has hired the business, the business keeps only your child’s name and attendance; the school holds the rest.
        </p>
        <p>
          <strong>Photos.</strong> You choose yes or no to photos and video when you register. We never ask you to upload a photo of your child. A photo in a sports business’s gallery is only shown on its page after the business confirms it holds consent for every child in it. PortPass does not see the consent forms; the business is responsible for them. Coach profile photos are not checked this way.
        </p>
        <p>
          <strong>Other notes.</strong> Anything you write in another free-text box, such as the goal of a private session, is kept with that request and seen by the coaches and the registration desk. Please keep health information to the registration form.
        </p>
        <p>
          <strong>How long.</strong> A child’s health details are deleted 90 days after the programme they registered for ends. See “How long we keep it” below.
        </p>

        <h2>How we use it</h2>
        <p>
          To handle your enquiry, registration or booking; to put you in touch with the business; to send you messages about that booking; to sign you in; to let a business run its listing, its team and its records; to answer questions you send us; and, if you asked us to tell you when something opens, to contact you about that.
        </p>
        <p>
          <strong>Emails we send.</strong> Your sign-in code. For a child’s registration: that it was received, that a payment was recorded, and that it was confirmed. For a private session: that a coach accepted it, with the time, place and how to pay. If a business adds you to its team: an invitation. If you own a business on PortPass: a warning whenever its bank details are changed. These emails carry names, the class, amounts and your reference code. They never carry health or emergency details. We also email ourselves when someone asks to be listed, and the business when an enquiry arrives; those notes carry the names on the request.
        </p>
        <p>
          We do not sell your information. We do not use it for advertising. We do not send marketing emails, other than the message you asked for when you joined a “tell me when this opens” list.
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
          <li><strong>Vercel:</strong> website hosting. Every page you open and every form you send passes through its servers, and its logs record your internet address and the address of each page.</li>
          <li><strong>Resend:</strong> sends our emails, so it handles the address, subject and text of each one.</li>
          <li><strong>Google:</strong> only if you choose to sign in with Google.</li>
          <li><strong>Microsoft Outlook:</strong> our own inbox, where requests to be listed and emails you send us arrive.</li>
          <li><strong>Anthropic and GitHub:</strong> tools we use to build and maintain PortPass. Anthropic’s AI also reads the public details of a business we plan to invite. They are not sent customer records in normal use.</li>
        </ul>
        <p>
          <strong>WhatsApp.</strong> WhatsApp buttons on PortPass open WhatsApp on your own device with a message you can edit. Nothing is sent unless you send it. The message then goes through WhatsApp, not through PortPass, and WhatsApp’s own terms apply. A business’s staff may also message you on WhatsApp at the number you gave them.
        </p>
        <p>
          <strong>Review badges.</strong> One listing, Bahamas Weddings By The Sea, shows its rating, an award and its reviews using WeddingWire’s own badges. On that page your browser loads them from WeddingWire, which can see your internet address and may set its own cookies.
        </p>
        <p>
          <strong>Where it is kept.</strong> Our database and photos are stored in the United States, with Supabase and Vercel. Emails pass through Resend and Microsoft, which may store them in the United States or elsewhere, and all of these companies’ networks may pass information through other countries on the way. We also keep encrypted backup copies of the database on a computer we control. When you send us your details, you agree to them being stored outside The Bahamas. Photos a business or coach uploads for its public page are stored at public web addresses.
        </p>
        <p>
          We may also disclose information when the law requires us to.
        </p>

        <h2 id="cookies">Cookies and what is kept on your device</h2>
        <p>
          PortPass sets a small number of cookies, all of them its own:
        </p>
        <ul>
          <li><strong>Sign-in:</strong> keeps you signed in to your PortPass account until you sign out, and holds a one-time check while you are signing in with Google.</li>
          <li><strong>Last place:</strong> remembers which part of PortPass you opened last, for up to a year. It is removed when you sign out.</li>
          <li><strong>Staff sign-in:</strong> keeps a business’s staff signed in to their staff area for up to 12 hours.</li>
          <li><strong>Administrator check:</strong> remembers for up to 12 hours that a PortPass administrator passed the second sign-in step.</li>
          <li><strong>How you found a business:</strong> on some businesses’ pages (today, Futprep’s), if you arrived from a tagged link, another website or another PortPass page, a cookie remembers the tags on the link, the name of that website and that you came through PortPass. It lasts 30 days, so it can be saved with your registration. It holds no name and nothing that identifies you.</li>
        </ul>
        <p>
          Your browser also keeps a few things that never leave your device: whether you closed the “get the app” banner, whether you have seen the opening animation, and copies of public pages you opened so they still open offline. Pages that show your personal information are not saved offline, and nothing you type into a form is saved offline. On a coach’s phone, attendance marks wait on the device until they are saved; they hold no names.
        </p>
        <p>
          PortPass sets no advertising cookies and does nothing of its own to follow you to other websites. The WeddingWire badges described above are the one thing on PortPass that another company controls. To count visits and measure page speed we use Vercel’s Web Analytics and Speed Insights, which Vercel builds to work without cookies and without identifying you. They record which public pages are opened and a few button taps, such as starting a registration or tapping a WhatsApp button, with no names or contact details. We leave out the staff, admin and account areas, and we remove reference codes and personal details from page addresses before they are sent.
        </p>
        <p>
          We use your internet (IP) address only to slow down repeated attempts on our forms and sign-ins. It is held in memory for a short time and is never saved in our own records. The companies that host PortPass and handle sign-in also see it, and may keep it in their own security logs.
        </p>

        <h2 id="retention">How long we keep it</h2>
        <ul>
          <li><strong>Children’s health details</strong> (allergies, medical conditions, medications, special needs and the notes box): deleted automatically 90 days after the programme ends, together with any earlier versions kept in the record’s edit history. “The programme” is the term or camp the child was registered for; a free taster or a waiting-list place counts from the end of that term.</li>
          <li><strong>Payment records:</strong> 7 years.</li>
          <li><strong>Enquiries that don’t become a booking</strong> (wedding enquiries, private-session and party requests, “tell me when this opens”, and requests to be listed): 2 years.</li>
          <li><strong>Registrations and bookings</strong> (names, contact details, class, attendance): kept as the business’s record while you are its customer, and for up to 7 years where a payment was recorded.</li>
          <li><strong>PortPass accounts:</strong> until you ask us to delete the account.</li>
          <li><strong>Sign-in codes:</strong> each one works once and stops working soon after it is sent.</li>
          <li><strong>The log of changes</strong> to team invitations, approvals and payment details: for as long as the business is on PortPass.</li>
        </ul>
        <p>
          At the end of these periods we delete the information, or remove the names from it so it can no longer be linked to you. The 90-day deletion of health details runs automatically every day. When a business’s registration desk corrects a child’s registration, the earlier value is kept in an edit history, with who changed it and when. Our encrypted backups are kept for about a year, so deleted information leaves the backups within about 13 months. When a business leaves PortPass, we give it a copy of its records (without children’s health details) and take its page down; the periods above still apply to what we hold.
        </p>

        <h2>Your rights</h2>
        <p>
          You can ask us, in writing, what information we hold about you and for a copy of it. You can ask us to correct it, to delete it, or to stop using it in a particular way. Email us at the address below. We may ask you to confirm who you are first. For a booking or a registration, you can write to the business or to us; we pass your request on to the business and help it answer. We answer as soon as we can, and always within 40 days (the Act allows 40 working days). If we can’t do what you ask, for example because the business must keep a payment record, we will tell you why.
        </p>
        <p>
          For a child’s registration, the business’s registration desk can correct the record for you, and each correction is logged.
        </p>
        <p>
          You can also complain to the Data Protection Commissioner at any time: Office of the Data Protection Commissioner, P.O. Box N-3017, Nassau, The Bahamas; telephone (242) 604-1001; <a href="mailto:dataprotection@bahamas.gov.bs">dataprotection@bahamas.gov.bs</a>; <a href="https://www.dataprotection.gov.bs" rel="noopener noreferrer">dataprotection.gov.bs</a>.
        </p>

        <h2>Deleting your account</h2>
        <p>
          Email us and we will close your PortPass account within 40 days. That removes your sign-in and your profile. Registrations and payments already made stay with the business you made them with, as its own records, for the periods above. If you were part of a business’s team, your membership ends. The business’s own information stays with the business. The log of changes still shows what was changed, and the email address an invitation was sent to.
        </p>

        <h2>How we protect it</h2>
        <p>
          Your browser never connects to our database. Every request for information goes through our own servers, and they decide what each signed-in person may see. Public photos load straight from our photo storage. A business’s staff area has its own sign-in, and five wrong PINs lock that sign-in for 15 minutes. PortPass’s own administrators need a second step, a code from an authenticator app, before they can open the admin area or a business’s records. Team invitations, approvals, changes to payment details and corrections to children’s registrations are logged with who made them. Connections to PortPass are encrypted.
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
