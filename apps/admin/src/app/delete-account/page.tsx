import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicPage, Section, SUPPORT_EMAIL } from '@/components/PublicPage';

export const metadata: Metadata = { title: 'Delete your account · LunchBox' };

/** The account deletion page Google Play asks for: how to delete, what is deleted, what is kept and for how long. */
export default function DeleteAccountPage() {
  return (
    <PublicPage title="Delete your LunchBox account" updated="20 November 2026">
      <Section title="In the app (fastest)">
        <ol className="list-decimal space-y-1 pl-6">
          <li>Open the LunchBox parent app and sign in.</li>
          <li>Go to <b>Account</b>.</li>
          <li>Tap <b>Delete account</b> and confirm.</li>
        </ol>
        <p>Your account is deleted straight away and you are signed out. Any active lunch plan is cancelled.</p>
      </Section>

      <Section title="Without the app">
        <p>
          {SUPPORT_EMAIL
            ? <>Email <a href={`mailto:${SUPPORT_EMAIL}?subject=Delete%20my%20LunchBox%20account`} className="text-primary underline">{SUPPORT_EMAIL}</a> from any address, with the mobile number you signed in with.</>
            : <>Write to the support address on our Google Play listing with the mobile number you signed in with.</>}
          {' '}We check that the request matches the number on the account and delete it within 7 days.
        </p>
        <p>Riders: ask LunchBox operations to close your partner account.</p>
      </Section>

      <Section title="What is deleted">
        <ul className="list-disc space-y-1 pl-6">
          <li>Your name, phone number, email and profile photo.</li>
          <li>Your children’s details and the notes for their schools.</li>
          <li>Your pickup addresses, map pins and instructions.</li>
          <li>Leave days, notifications and your sign-in account.</li>
        </ul>
      </Section>

      <Section title="What is kept, and why">
        <ul className="list-disc space-y-1 pl-6">
          <li><b>Payment records</b> (amount, date, method, Razorpay reference) for as long as Indian tax and accounting law requires. They are not linked to your name after deletion.</li>
          <li><b>Past delivery records</b> without your personal details, so riders’ earnings and payouts stay correct.</li>
          <li><b>Security and audit logs</b> for up to 3 years, then deleted.</li>
        </ul>
        <p>Handover photos and rider location history are deleted automatically after 90 days.</p>
      </Section>

      <p className="text-sm text-muted-foreground">More in our <Link href="/privacy/" className="text-primary underline">privacy policy</Link>.</p>
    </PublicPage>
  );
}
