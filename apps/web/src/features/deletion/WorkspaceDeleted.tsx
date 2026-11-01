import type { DeletionRequest } from '@snapform/contracts/deletion';
const dates = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeStyle: 'short',
});
export function WorkspaceDeleted({ receipt }: { receipt: DeletionRequest }) {
  if (
    receipt.kind !== 'workspace' ||
    receipt.state !== 'deleted' ||
    !receipt.deletedAt
  )
    return null;
  return (
    <section
      className="workspace-empty"
      aria-labelledby="workspace-deleted-title"
    >
      <h1 id="workspace-deleted-title">Workspace deleted.</h1>
      <p>Its forms, responses and delivery history have been removed.</p>
      <p>
        Completed{' '}
        <time dateTime={receipt.deletedAt}>
          {dates.format(new Date(receipt.deletedAt))}
        </time>
        .
      </p>
      <p className="deletion-reference">
        Deletion reference <code>{receipt.id}</code>
      </p>
    </section>
  );
}
