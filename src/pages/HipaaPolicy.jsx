import { useNavigate } from 'react-router-dom';
import { ShieldAlert, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function HipaaPolicy() {
  const navigate = useNavigate();

  const handleAccept = () => {
    localStorage.setItem('emit_hipaa_accepted', 'true');
    navigate('/', { replace: true });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-start px-4 py-10">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-4">
            <ShieldAlert className="w-7 h-7 text-amber-400" />
          </div>
          <h1 className="text-2xl font-black tracking-wide text-foreground">HIPAA Disclaimer</h1>
          <p className="text-sm text-muted-foreground mt-1">Emergency Medical Intervention Tracker</p>
          <p className="text-xs text-muted-foreground/60 mt-0.5">Effective Date: May 18, 2026</p>
        </div>

        {/* Content Card */}
        <div className="bg-card border border-border rounded-2xl p-6 space-y-6 text-sm text-muted-foreground leading-relaxed mb-8">

          <p className="text-foreground/80">
            Emergency Medical Intervention Tracker ("the App") is designed solely as a time-tracking and event-marking utility for emergency medical workflows. The App is <strong className="text-foreground">not</strong> intended to create, store, transmit, process, or manage Protected Health Information (PHI) as defined under the Health Insurance Portability and Accountability Act of 1996 ("HIPAA").
          </p>

          <Section title="No HIPAA Compliance Intended">
            <p>The App is not marketed or represented as a HIPAA-compliant platform, electronic medical record system, patient charting application, or secure healthcare communication service.</p>
            <p className="mt-2 font-medium text-foreground/70">Users are expressly prohibited from entering or storing:</p>
            <BulletList items={[
              'Patient names',
              'Dates of birth',
              'Addresses',
              'Medical record numbers',
              'Social Security numbers',
              'Photographs of patients',
              'Audio recordings containing patient identifiers',
              'Any other information protected under HIPAA',
            ]} />
          </Section>

          <Section title="User Responsibility">
            <p>Users are solely responsible for ensuring that no Protected Health Information is entered into or stored within the App. Any misuse of the App involving PHI is done entirely at the user's own risk.</p>
          </Section>

          <Section title="No Business Associate Relationship">
            <p>Use of the App does not create a Business Associate relationship between the developer/operator of Emergency Medical Intervention Tracker and any healthcare provider, agency, employer, or user.</p>
            <p className="mt-2">The developer/operator of the App does not:</p>
            <BulletList items={[
              'Receive PHI',
              'Process PHI',
              'Store PHI',
              'Transmit PHI',
              'Maintain HIPAA-secured infrastructure',
            ]} />
          </Section>

          <Section title="Intended Use">
            <p>The App is intended only for:</p>
            <BulletList items={[
              'General event timing',
              'Procedure timestamp tracking',
              'Workflow assistance',
              'Educational or operational support purposes',
            ]} />
            <p className="mt-2">The App should not be used as a substitute for official patient care reporting systems, electronic health records, or other HIPAA-compliant documentation platforms.</p>
          </Section>

          <Section title="Limitation of Liability">
            <p>The developer/operator of Emergency Medical Intervention Tracker assumes no liability for any HIPAA violations, unauthorized disclosures, or regulatory issues arising from improper use of the App by users.</p>
          </Section>

          <Section title="Contact">
            <p>For questions regarding this policy, contact:</p>
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
          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-400/60 shrink-0" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}