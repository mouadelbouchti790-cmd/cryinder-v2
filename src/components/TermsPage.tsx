import LegalPage from './LegalPage';

interface TermsPageProps {
  onBack: () => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="font-display mb-3 text-xl font-extrabold tracking-[-0.01em]">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-white/55">{children}</div>
    </section>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-2 pl-5">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export default function TermsPage({ onBack }: TermsPageProps) {
  return (
    <LegalPage title="Terms of Service" lastUpdated="August 24, 2026" onBack={onBack}>
      <Section title="1. Acceptance of Terms">
        <p>
          By using Cryinder ("the App," "we," "us," or "our"), you agree to be bound by these
          Terms of Service ("Terms"). If you do not agree, do not use the App.
        </p>
      </Section>

      <Section title="2. Eligibility">
        <p>
          You must be at least 18 years old to use Cryinder. By using the App, you represent
          and warrant that you are 18 or older.
        </p>
      </Section>

      <Section title="3. Description of Service">
        <p>Cryinder is a crypto discovery platform that allows users to:</p>
        <List
          items={[
            'Discover memecoins and tokens',
            'Swipe right to express interest',
            'Swipe left to skip',
            'Earn Cryinder Points (CP)',
            'Open daily loot boxes',
            'Connect their Solana wallet',
            'Book ad slots for token promotion',
          ]}
        />
      </Section>

      <Section title="4. User Accounts">
        <p>Your Cryinder profile is created from your Solana wallet address:</p>
        <List
          items={[
            'Connect any Solana wallet (Phantom, Solflare, etc.)',
            'Your profile is tied to your wallet, not an email or password',
          ]}
        />
        <p>You are responsible for maintaining the security of your account and wallet.</p>
      </Section>

      <Section title="5. User Conduct">
        <p>You agree NOT to:</p>
        <List
          items={[
            'Use Cryinder for illegal purposes',
            'Manipulate the platform (e.g., fake swipes, bots)',
            'Harass or abuse other users',
            'Share false or misleading information',
            'Attempt to hack or disrupt the platform',
          ]}
        />
      </Section>

      <Section title="6. Cryinder Points (CP) and Loot Boxes">
        <List
          items={[
            'CP are earned through swiping and other activities',
            'CP have no monetary value and cannot be exchanged for cash',
            'CP may be converted to Cryinder tokens at a future date (subject to change)',
            'Loot boxes are a gamification feature - rewards are random',
          ]}
        />
      </Section>

      <Section title="7. Ad Slots">
        <p>
          Ad slots are offered to token creators and projects for promotional purposes.
          Cryinder reserves the right to:
        </p>
        <List
          items={[
            'Accept or reject any ad booking',
            'Change pricing and slot availability at any time',
            'Remove any promoted token without notice',
          ]}
        />
      </Section>

      <Section title="8. Disclaimer of Warranties">
        <p>
          Cryinder is provided "as is" and "as available." We do not guarantee that the App
          will be error-free, secure, or uninterrupted. Cryptocurrency trading involves high
          risk. Use the App at your own risk.
        </p>
      </Section>

      <Section title="9. Limitation of Liability">
        <p>To the fullest extent permitted by law, Cryinder is not liable for:</p>
        <List
          items={[
            'Financial losses from trading',
            'Loss of data',
            'Wallet security breaches',
            'Third-party actions',
            'Any damages arising from your use of the App',
          ]}
        />
      </Section>

      <Section title="10. Termination">
        <p>We reserve the right to suspend or terminate your account at any time for:</p>
        <List
          items={[
            'Violation of these Terms',
            'Suspicious activity',
            'Harm to the platform or other users',
          ]}
        />
      </Section>

      <Section title="11. Changes to These Terms">
        <p>
          We may update these Terms from time to time. We will notify you of changes by
          posting the new Terms on this page. Your continued use of Cryinder constitutes
          acceptance of the new Terms.
        </p>
      </Section>
    </LegalPage>
  );
}
