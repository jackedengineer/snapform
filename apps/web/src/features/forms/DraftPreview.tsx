import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { FormDefinition } from '@snapform/contracts/form';
import type { Answer } from '@snapform/contracts/answers';
import { FieldControl } from '../intake/FieldControl';
import { previewState } from './preview-state';

export function DraftPreview({
  definition,
  onClose,
}: {
  definition: FormDefinition;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [stepId, setStepId] = useState('');
  const [checked, setChecked] = useState(false);
  const [finished, setFinished] = useState(false);
  const state = previewState(definition, answers, stepId);
  useEffect(() => {
    const element = dialog.current;
    // Removing the dialog releases its modal state. Closing during effect
    // cleanup would also fire onClose during React's development replay.
    if (element && !element.open) element.showModal();
  }, []);
  useEffect(() => {
    heading.current?.focus();
  }, [stepId, finished]);
  return createPortal(
    <dialog
      ref={dialog}
      className="draft-preview"
      aria-labelledby="preview-heading"
      onClose={onClose}
    >
      <div className="preview-toolbar">
        <span>Draft preview · answers stay in this preview</span>
        <button type="button" className="text-button" onClick={onClose}>
          Close preview
        </button>
      </div>
      <form
        className="preview-sheet"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!state.ok || !state.step) return;
          setChecked(true);
          if (state.issues.length) {
            document
              .getElementById('answer-' + state.issues[0].targetId)
              ?.focus();
            return;
          }
          if (state.index + 1 < state.steps.length)
            setStepId(state.steps[state.index + 1].id);
          else setFinished(true);
          setChecked(false);
        }}
      >
        {finished && (
          <p className="preview-progress">Completion message preview</p>
        )}
        <h2 ref={heading} tabIndex={-1} id="preview-heading">
          {finished && state.ok
            ? state.ending?.title
            : definition.title || 'Untitled form'}
        </h2>
        {!state.ok ? (
          <p role="alert">
            Fix the form’s validation issues to preview this draft.
          </p>
        ) : finished ? (
          <>
            <p>{state.ending?.description}</p>
            <p role="status" className="preview-notice">
              Preview complete. No response was submitted.
            </p>
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                setAnswers({});
                setStepId('');
                setFinished(false);
                setChecked(false);
              }}
            >
              Restart preview
            </button>
          </>
        ) : (
          <>
            {definition.description && (
              <p className="preview-description">{definition.description}</p>
            )}
            <p className="preview-progress">
              {state.steps.length
                ? `${state.index + 1} of ${state.steps.length}`
                : 'Add a question to see it here.'}
            </p>
            {state.step?.blocks.map((block) => (
              <FieldControl
                key={block.id}
                block={block}
                answer={answers[block.id]}
                error={
                  checked
                    ? state.issues.find((issue) => issue.targetId === block.id)
                        ?.message
                    : undefined
                }
                onBlur={() => {}}
                onChange={(answer) =>
                  setAnswers((previous) => ({
                    ...previous,
                    [block.id]: answer,
                  }))
                }
              />
            ))}
            {state.step && (
              <div className="preview-actions">
                {state.index > 0 && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      setStepId(state.steps[state.index - 1].id);
                      setChecked(false);
                    }}
                  >
                    Back
                  </button>
                )}
                <button type="submit" className="button primary">
                  {state.index + 1 < state.steps.length
                    ? 'Continue'
                    : 'Finish preview'}{' '}
                  <span aria-hidden="true">→</span>
                </button>
              </div>
            )}
          </>
        )}
      </form>
    </dialog>,
    document.body,
  );
}
