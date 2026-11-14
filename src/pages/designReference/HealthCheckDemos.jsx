import { useState } from 'react';
import {
  Button, PageHeader, PdfPanel, PlayButton, ResultsHeadline, ResultsSection, SentenceInfo, SlidePanel, StartQuestions, TitleIcons, WhoSees, useIsPhone, useToast,
} from '../../components/design';
import { HealthCheckChart, HealthCheckEye, ProjectList } from '../healthCheck';
import { EXAMPLE } from '../../health-check/example';
import { SUCCESS_FACTOR_INFO, chartInfo, resultRows } from '../../health-check/words';
import { popLines } from '../healthCheck/HealthCheckResults';

// The parts the Health Check's calm rebuild brought (M7b version 51 and M7;
// Tim, 13 and 14 Nov), each shared: two icons beside a title, an ⓘ with a
// heading and bullets, step bars with their word under them, a results
// section with its own Edit, questions with a topic and a reason, the dot
// chart, the PDF choice in a side panel and the wide side panel.

export function TitleIconsDemo() {
  const toast = useToast();
  const [shared, setShared] = useState(true);
  return (
    <div className="dr-stack">
      <PageHeader
        as="h3"
        title="Strategic Alignment Health Check"
        aside={(
          <TitleIcons>
            <PlayButton label="Quick guide" onClick={() => toast.show('The Quick guide opens here.')} />
            <HealthCheckEye coachName="Tim" shared={shared} onShare={setShared} />
          </TitleIcons>
        )}
      />
      <PageHeader as="h3" title="One icon alone" aside={<WhoSees audience="me" />} />
    </div>
  );
}

export function InfoListDemo() {
  return (
    <div className="dr-stack">
      <p><SentenceInfo lines={popLines(SUCCESS_FACTOR_INFO)} label="What is a Success Factor?">Success Factors</SentenceInfo></p>
      <p><SentenceInfo lines={popLines(chartInfo(50))} label="How to read the chart">Strategic importance against progress</SentenceInfo></p>
    </div>
  );
}

export function ProjectListDemo() {
  const toast = useToast();
  const rows = resultRows(EXAMPLE.draft).slice(0, 4);
  return (
    <ProjectList rows={rows} theirs onOpen={() => toast.show('The example can’t be edited.')} />
  );
}

export function HealthCheckChartDemo() {
  const phone = useIsPhone();
  const rows = resultRows(EXAMPLE.draft);
  // Where three projects stood in an earlier version (Compare two versions, M7).
  const was = { [rows[0].id]: { progress: 1, importance: rows[0].importance - 6 }, [rows[2].id]: { progress: 4, importance: rows[2].importance } };
  return <HealthCheckChart rows={rows} line={50} phone={phone} was={was} />;
}

export function ResultsPartsDemo() {
  const toast = useToast();
  return (
    <div>
      <ResultsSection first><ResultsHeadline>2 of your 5 important projects are moving well.</ResultsHeadline></ResultsSection>
      <ResultsSection title="Objective" action={<Button variant="text" aria-label="Edit the objective" onClick={() => toast.show('The objective opens with “Save my edit”.')}>Edit</Button>}>
        <p>Double recurring revenue by 2028.</p>
      </ResultsSection>
      <StartQuestions
        title="Questions to start with"
        questions={[
          { key: 'timing', label: 'Timing', question: 'Is “Enterprise sales team” worth a sprint of extra resource to finish by Dec 2026, or should its timeline change?', reason: 'You rated its progress “Bad”, and it’s due to finish in 2 months.' },
          { key: 'resource', label: 'Resource', question: 'Is “New office fit-out” worth the resource it takes?', reason: 'You rated its resource requirements “High”, and its strategic importance is 15%.' },
        ]}
      />
    </div>
  );
}

export function PdfPanelDemo() {
  const [open, setOpen] = useState(null);
  return (
    <div className="dr-stack">
      <Button onClick={() => setOpen('pdf')}>Download my PDF</Button>
      <Button onClick={() => setOpen('wide')}>Open a wide panel</Button>
      <PdfPanel open={open === 'pdf'} onClose={() => setOpen(null)} getDocument={async () => (await import('../../lib/pdf/docs/sample')).samplePdf()} />
      <SlidePanel open={open === 'wide'} onClose={() => setOpen(null)} title="Quick guide" wide>
        <p>A side panel wide enough for a picture.</p>
      </SlidePanel>
    </div>
  );
}
