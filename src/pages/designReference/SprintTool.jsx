import { GuidedTool } from '../../components/design';
import { stepDraft } from './useSprintDemo';

// The Start a sprint demo as a guided tool, framed in the gallery or
// full screen (see useSprintDemo.jsx for its steps and answers).
export default function SprintTool({ demo, layout, open, onClose, role }) {
  return (
    <GuidedTool
      key={demo.run}
      layout={layout}
      open={open}
      name="Start a sprint"
      steps={demo.steps}
      skipLabel="Skip"
      finishLabel="Start Performance Sprint 5"
      saveState={demo.state}
      role={role}
      draftKey={stepDraft(demo.key, layout)}
      onClose={onClose}
      onFinish={() => { demo.finish(); onClose?.('finished'); }}
    />
  );
}
