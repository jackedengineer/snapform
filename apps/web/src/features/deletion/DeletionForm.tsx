import { useId, useRef, useState } from 'react';
import { deletionConfirmationMatches } from '@snapform/contracts/deletion';
import type { DeletionTarget } from '@snapform/contracts/deletion';
type Props = {
  target: DeletionTarget;
  confirmation: string;
  pending: boolean;
  error?: string;
  submit: (input: unknown) => Promise<unknown>;
};
export function DeletionForm({
  target,
  confirmation,
  pending,
  error,
  submit,
}: Props) {
  const id = useId(),
    input = useRef<HTMLInputElement>(null),
    checkbox = useRef<HTMLInputElement>(null),
    busy = useRef(false);
  const [requestId] = useState(() => crypto.randomUUID());
  const [invalid, setInvalid] = useState({
    confirmation: false,
    acknowledge: false,
  });
  return (
    <form
      className="deletion-form"
      noValidate
      onSubmit={async (event) => {
        event.preventDefault();
        if (pending || busy.current || !input.current || !checkbox.current)
          return;
        const value = input.current.value;
        const matches = deletionConfirmationMatches(
          target.kind,
          confirmation,
          value,
        );
        input.current.setCustomValidity(
          matches ? '' : 'Enter the confirmation exactly as shown.',
        );
        setInvalid({
          confirmation: !matches,
          acknowledge: !checkbox.current.checked,
        });
        if (!event.currentTarget.reportValidity()) return;
        busy.current = true;
        try {
          await submit({
            ...target,
            requestId,
            confirmation: value,
            acknowledgeDeletion: true,
          });
        } catch {
          // Keep the same identity and native field values for the visible retry.
        } finally {
          busy.current = false;
        }
      }}
    >
      <p>
        This stops{' '}
        {target.kind === 'workspace'
          ? 'new responses, edits and delivery across this workspace'
          : 'respondent access and delivery for this response'}{' '}
        immediately. Deletion starts after 24 hours. After that, it cannot be
        undone.
      </p>
      <div className="field">
        <label htmlFor={id}>
          Type <strong>{confirmation}</strong> to confirm
        </label>
        <input
          ref={input}
          id={id}
          maxLength={160}
          autoComplete="off"
          spellCheck={false}
          required
          disabled={pending}
          aria-invalid={invalid.confirmation}
          aria-describedby={invalid.confirmation ? `${id}-error` : undefined}
          onInput={(event) => {
            event.currentTarget.setCustomValidity('');
            setInvalid((previous) => ({ ...previous, confirmation: false }));
          }}
        />
        {invalid.confirmation && (
          <p id={`${id}-error`} className="field-error" role="alert">
            Enter the confirmation exactly as shown.
          </p>
        )}
      </div>
      <div>
        <label className="deletion-ack">
          <input
            ref={checkbox}
            type="checkbox"
            required
            disabled={pending}
            aria-invalid={invalid.acknowledge}
            aria-describedby={
              invalid.acknowledge ? `${id}-ack-error` : undefined
            }
            onChange={() =>
              setInvalid((previous) => ({ ...previous, acknowledge: false }))
            }
          />
          <span>
            I understand this data will be permanently deleted after the 24-hour
            cancellation window.
          </span>
        </label>
        {invalid.acknowledge && (
          <p id={`${id}-ack-error`} className="field-error" role="alert">
            Confirm that you understand the deletion window.
          </p>
        )}
      </div>
      {error && (
        <p className="request-error" role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        className="button secondary compact-button deletion-submit"
        disabled={pending}
      >
        {pending ? 'Confirming…' : 'Schedule deletion'}
      </button>
    </form>
  );
}
