import { useState } from 'react';
import { SavedSignature, SignaturePad, useToast } from '../../components/design';
import { signingWords } from '../../lib/billing/agreementText';
import { GlancePanel } from '../coaching/AgreementParts';
import '../coaching/coaching.css';

// The signing parts (Phase 6b run 1; M13 A3, A4 and A7): the At a glance panel, the signature
// box and a saved signature. Nothing is kept: "Use this signature" shows it saved here only.

const WORDS = signingWords('Tim');
const VERSION = {
  id: '00000000-0000-4000-8000-000000000001', version: 3, fundedBy: null, currency: 'GBP', totalMinor: 200000, clauses: [],
  terms: {
    coaching: '4-month coaching', sessions: 10, minutes: 60, place: 'Zoom', rhythm: 'every 2 weeks', startsOn: '2026-09-24', endsOn: '2027-01-15',
    instalments: 5, clientName: 'Ben Carter', clientEmail: 'ben@example.invalid', coachName: 'Dr. Tim Dutton', coachFirst: 'Tim',
  },
};

export function SigningDemo() {
  const toast = useToast();
  const [saved, setSaved] = useState(null);
  const [problem, setProblem] = useState(null);
  return (
    <div className="dr-stack">
      <GlancePanel version={VERSION} />
      {saved ? (
        <SavedSignature image={saved} action={WORDS.drawNew} onAction={() => setSaved(null)} />
      ) : (
        <SignaturePad
          label={WORDS.drawFirst}
          words={WORDS}
          problem={problem}
          onEmpty={() => setProblem('Draw your signature to carry on.')}
          onUse={(image) => { setProblem(null); setSaved(image); toast.show('Saved to your account for next time.'); }}
          onTypeInstead={() => toast.show('The Your full name box opens here.')}
        />
      )}
    </div>
  );
}
