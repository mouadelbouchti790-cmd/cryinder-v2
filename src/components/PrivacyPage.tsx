import LegalPage from './LegalPage';

interface PrivacyPageProps {
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

export default function PrivacyPage({ onBack }: PrivacyPageProps) {
  return (
    <LegalPage title="Privacy Policy" lastUpdated="August 24, 2026" onBack={onBack}>
      <Section title="1. Information We Collect">
        <p>We collect the following information when you use Cryinder:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-white/85">Personal Information:</strong> username,
            wallet address
          </li>
          <li>
            <strong className="text-white/85">Usage Data:</strong> swipes, points, loot box
            activity, ad interactions
          </li>
          <li>
            <strong className="text-white/85">Device Information:</strong> browser type, IP
            address, device type
          </li>
        </ul>
      </Section>

      <Section title="2. How We Use Your Information">
        <p>We use your information to:</p>
        <List
          items={[
            'Provide and improve Cryinder',
            'Track user activity and engagement',
            'Send updates and notifications',
            'Manage ad slots and bookings',
            'Generate leaderboards and rankings',
          ]}
        />
      </Section>

      <Section title="3. Data Storage">
        <p>
          Your data is stored locally on our servers. We do not sell, rent, or share your
          personal data with third parties, except:
        </p>
        <List
          items={[
            'When required by law',
            'To protect the security of the platform',
            'With your explicit consent',
          ]}
        />
      </Section>

      <Section title="4. Wallet Data">
        <p>We store your wallet address to:</p>
        <List
          items={[
            'Link your account to your on-chain identity',
            'Track your swipes and points',
            'Enable future token distribution',
          ]}
        />
        <p>We do not store your private keys or seed phrases.</p>
      </Section>

      <Section title="5. Cookies and Tracking">
        <p>We use minimal cookies for:</p>
        <List items={['Session management', 'User preferences']} />
        <p>You can disable cookies in your browser settings.</p>
      </Section>

      <Section title="6. Third-Party Services">
        <p>Cryinder uses:</p>
        <List
          items={[
            'DexScreener for token data (public API)',
            'Jupiter for swap execution',
            'Helius for on-chain portfolio data',
          ]}
        />
        <p>These services have their own privacy policies.</p>
      </Section>

      <Section title="7. Data Retention">
        <p>
          We retain your data for as long as your account is active. You may request deletion
          of your data by contacting us at{' '}
          <a
            href="mailto:privacy@cryinder.xyz"
            className="font-semibold text-white/85 underline underline-offset-2 transition-colors hover:text-white"
          >
            privacy@cryinder.xyz
          </a>
          .
        </p>
      </Section>

      <Section title="8. Security">
        <p>We take reasonable measures to protect your data, including:</p>
        <List
          items={[
            'HTTPS encryption',
            'Secure database storage',
            'Limited access to sensitive data',
          ]}
        />
        <p>However, no system is 100% secure.</p>
      </Section>

      <Section title="9. Children's Privacy">
        <p>
          Cryinder is not intended for users under 18. We do not knowingly collect data from
          minors.
        </p>
      </Section>

      <Section title="10. Changes to This Policy">
        <p>
          We may update this Privacy Policy from time to time. We will notify you of changes
          by posting the new policy on this page.
        </p>
      </Section>
    </LegalPage>
  );
}
