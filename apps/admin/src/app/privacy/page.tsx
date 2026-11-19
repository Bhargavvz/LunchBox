import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicPage, Section, SUPPORT_EMAIL } from '@/components/PublicPage';

export const metadata: Metadata = { title: 'Privacy policy · LunchBox' };

/**
 * The privacy policy linked from Google Play and the apps. It describes what the code does: what is collected, who
 * sees it, how long it is kept and how to use your rights under India's Digital Personal Data Protection Act.
 */
export default function PrivacyPage() {
  return (
    <PublicPage title="Privacy policy" updated="20 November 2026">
      <p>
        LunchBox takes home-cooked lunchboxes from your home to your child’s school. This policy explains what we collect
        in the LunchBox parent app and the LunchBox partner (rider) app, why, who can see it, how long we keep it and the
        choices you have. We collect only what we need to run deliveries safely and on time.
      </p>

      <Section title="What we collect from parents">
        <ul className="list-disc space-y-1 pl-6">
          <li><b>Account:</b> your mobile number (you sign in with a code sent by SMS), name, preferred language, and an email address and profile photo if you add them.</li>
          <li><b>Your children:</b> name, school, class, section, roll number and an optional note for the school (for example allergies). We process children’s data only with your consent as their parent.</li>
          <li><b>Pickup addresses:</b> the address, a map pin you place yourself, a landmark and instructions for the rider.</li>
          <li><b>Plans and payments:</b> the plan, pickup days, leave days, and payment records (amount, date, method and the Razorpay reference). Card, UPI and bank details are entered on Razorpay’s secure page and never reach LunchBox.</li>
          <li><b>Deliveries:</b> order history, pickup and handover times, the photo taken at the school gate, and ratings you give.</li>
          <li><b>Location:</b> the parent app uses your location only when you choose “use my location” to place an address pin. It does not track you.</li>
          <li><b>Device:</b> a notification token so we can send delivery updates, and basic technical logs (IP address, app version) to keep the service secure.</li>
        </ul>
      </Section>

      <Section title="What we collect from riders">
        <p>
          Name, mobile number, vehicle details, shift times, earnings and bank details for payouts (through RazorpayX).
          While a rider’s route is active, the rider app shares the phone’s location so parents can follow their child’s
          lunchbox and operations can keep deliveries on time. Location is not collected outside an active route.
        </p>
      </Section>

      <Section title="Who can see what">
        <ul className="list-disc space-y-1 pl-6">
          <li><b>Riders</b> see a parent’s first name, the pickup address, landmark and instructions, and the child’s first name and class. They never see phone numbers.</li>
          <li><b>Parents</b> see the rider’s first name, vehicle and rating, and the rider’s position on a map only while their child’s lunchbox is on the way (and only if live tracking is turned on).</li>
          <li><b>Schools</b> see which children’s lunchboxes are arriving, with the note you wrote for the school.</li>
          <li><b>LunchBox operations staff</b> see what they need to run deliveries and support you; every access to personal data is logged.</li>
          <li><b>Service providers</b> that process data for us: Google Firebase (sign-in, notifications, photo storage), Razorpay (payments and rider payouts), MSG91 (SMS updates) and Amazon Web Services (hosting). We do not sell personal data or use it for advertising.</li>
        </ul>
      </Section>

      <Section title="How long we keep it">
        <ul className="list-disc space-y-1 pl-6">
          <li>Account, children and address data: until you delete your account.</li>
          <li>Rider location history: 90 days. Handover photos: 90 days.</li>
          <li>Payment records: as long as Indian tax and accounting law requires, even after an account is deleted.</li>
          <li>Security and audit logs: up to 3 years.</li>
        </ul>
      </Section>

      <Section title="Your rights and choices">
        <ul className="list-disc space-y-1 pl-6">
          <li><b>See your data:</b> in the parent app, Account → Download my data.</li>
          <li><b>Correct it:</b> edit your profile, children and addresses in the app.</li>
          <li><b>Withdraw consent:</b> turn live tracking off under Account → Live location; you can withdraw other consents by deleting your account.</li>
          <li><b>Delete your account:</b> Account → Delete account, or see <Link href="/delete-account/" className="text-primary underline">how to delete your account</Link>.</li>
          <li><b>Notifications:</b> turn them off in your phone’s settings.</li>
        </ul>
      </Section>

      <Section title="Security">
        <p>
          Data is encrypted in transit (HTTPS), sign-in uses one-time SMS codes, staff sign in with a second step, pickup
          codes are encrypted, and photos are stored in a private bucket reachable only through short-lived links.
        </p>
      </Section>

      <Section title="Contact and grievances">
        <p>
          {SUPPORT_EMAIL
            ? <>Write to our grievance officer at <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary underline">{SUPPORT_EMAIL}</a>. We reply within 7 days.</>
            : <>Contact us through the support address on our Google Play listing. We reply within 7 days.</>}
          {' '}If you are not satisfied, you may complain to the Data Protection Board of India.
        </p>
      </Section>
    </PublicPage>
  );
}
