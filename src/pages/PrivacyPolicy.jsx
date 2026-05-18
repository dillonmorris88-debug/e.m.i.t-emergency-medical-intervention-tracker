import { useNavigate } from 'react-router-dom';
import { Shield, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  const handleAccept = () => {
    localStorage.setItem('emit_privacy_accepted', 'true');
    navigate('/', { replace: true });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-start px-4 py-10">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center mb-4 glow-red">
            <Shield className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-black tracking-wide text-foreground">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground mt-1">Emergency Medical Intervention Tracker</p>
          <p className="text-xs text-muted-foreground/60 mt-0.5">Effective Date: May 18, 2026</p>
        </div>

        {/* Content Card */}
        <div className="bg-card border border-border rounded-2xl p-6 space-y-6 text-sm text-muted-foreground leading-relaxed mb-8">

          <p className="text-foreground/80">
            Emergency Medical Intervention Tracker ("the App") respects your privacy. This Privacy Policy explains how information is handled when using the App.
          </p>

          <Section title="Information Collection">
            <p>The App is designed to function without collecting personally identifiable information. The App does not sell, rent, or share personal data with third parties.</p>
            <p className="mt-2">Depending on device permissions granted by the user, the App may access:</p>
            <BulletList items={[
              'Microphone access for voice command functionality',
              'Speech recognition services for command interpretation',
              'Local device storage for saving event timelines or logs',
            ]} />
            <p className="mt-2">Any data generated within the App is stored locally on the user's device unless the user explicitly exports or shares it themselves.</p>
          </Section>

          <Section title="No Sale or Sharing of Personal Data">
            <p>Emergency Medical Intervention Tracker does not:</p>
            <BulletList items={[
              'Sell personal information',
              'Share personal information with advertisers',
              'Use user data for marketing purposes',
              'Track users across third-party apps or websites',
            ]} />
          </Section>

          <Section title="Third-Party Services">
            <p>The App may rely on Apple iOS system frameworks such as:</p>
            <BulletList items={[
              'Speech Recognition',
              'Audio Services',
              'Local Notifications',
            ]} />
            <p className="mt-2">These services are governed by Apple's own privacy policies.</p>
          </Section>

          <Section title="Data Security">
            <p>Reasonable measures are taken to help protect information stored within the App. However, no method of electronic storage or transmission is completely secure.</p>
          </Section>

          <Section title="Children's Privacy">
            <p>The App is not directed toward children under the age of 13 and does not knowingly collect personal information from children.</p>
          </Section>

          <Section title="Changes to This Privacy Policy">
            <p>This Privacy Policy may be updated periodically. Changes will be reflected by updating the "Effective Date" above.</p>
          </Section>

          <Section title="Contact">
            <p>For questions regarding this Privacy Policy, contact:</p>
            <p className="mt-2 font-medium text-foreground/70">Emergency Medical Intervention Tracker Support</p>
            <p>Email: <span className="text-primary">support@emitapp.com</span></p>
          </Section>
        </div>

        {/* Accept Button */}
        <Button
          onClick={handleAccept}
          className="w-full h-12 font-bold text-base"
        >
          <Check className="w-4 h-4 mr-2" />
          I Understand &amp; Accept
        </Button>
        <p className="text-center text-xs text-muted-foreground/50 mt-3">
          You must accept to continue using the App
        </p>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <h2 className="text-sm font-bold text-foreground mb-2 uppercase tracking-wider">{title}</h2>
      {children}
    </div>
  );
}

function BulletList({ items }) {
  return (
    <ul className="mt-1 space-y-1 ml-2">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2">
          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}