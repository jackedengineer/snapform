import { useState, useRef, useEffect } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { can } from '@snapform/contracts/workspace';
import { formatResponseAnswer } from '@snapform/contracts/response-display';
import { useAccountUser } from '../auth/AccountLayout';
import { fetchResponses, fetchResponse, responseExportPath } from './api';
import './responses.css';
import { EmailNotifications } from './EmailNotifications';
const dates = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeStyle: 'short',
});
export function ResponseInbox({
  workspaceId,
  formId,
  selected,
}: {
  workspaceId: string;
  formId: string;
  selected?: string;
}) {
  const user = useAccountUser();
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const cursor = cursors.at(-1);
  const page = useQuery({
    queryKey: ['responses', user.id, workspaceId, formId, cursor],
    queryFn: ({ signal }) =>
      fetchResponses(workspaceId, formId, cursor, signal),
  });
  const detail = useQuery({
    queryKey: ['response', user.id, workspaceId, formId, selected],
    enabled: Boolean(selected),
    queryFn: ({ signal }) =>
      fetchResponse(workspaceId, formId, selected || '', signal),
  });
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (detail.data) heading.current?.focus();
  }, [detail.data]);
  return (
    <div className="workspace-home response-home">
      <Link
        className="back-link"
        to="/workspaces/$workspaceId/forms/$formId"
        params={{ workspaceId, formId }}
      >
        ← Back to form
      </Link>
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">YOUR RESPONSE INBOX</p>
          <h1>Every answer, in context.</h1>
          <p className="intro-copy">
            Completed submissions, with the questions each person saw.
          </p>
        </div>
        <button
          className="text-button"
          disabled={page.isFetching || detail.isFetching}
          onClick={() => {
            void page.refetch();
            if (selected) void detail.refetch();
          }}
        >
          Refresh
        </button>
      </div>
      {page.data && (
        <EmailNotifications
          key={`${workspaceId}:${formId}`}
          workspaceId={workspaceId}
          formId={formId}
          userId={user.id}
          canManage={can(page.data.role, 'integrations.manage')}
        />
      )}
      {page.isPending ? (
        <p role="status">Loading responses…</p>
      ) : page.isError ? (
        <div className="workspace-empty">
          <h2>Let’s reconnect.</h2>
          <p role="alert">{page.error.message}</p>
        </div>
      ) : (
        <div className="response-layout">
          <section aria-label="Submitted responses">
            {page.data.responses.length === 0 ? (
              <div className="workspace-empty">
                <h2>Your first response will land here.</h2>
                <p>
                  Share your published form to start collecting. Incomplete
                  answers stay private to the respondent.
                </p>
              </div>
            ) : (
              <ul className="response-list">
                {page.data.responses.map((response) => (
                  <li key={response.id}>
                    <Link
                      to="/workspaces/$workspaceId/responses/$formId"
                      params={{ workspaceId, formId }}
                      search={{ response: response.id }}
                      aria-current={
                        selected === response.id ? 'page' : undefined
                      }
                    >
                      <span className="response-reference">
                        Response {response.id.slice(0, 8)}
                      </span>
                      <time dateTime={response.submittedAt}>
                        {dates.format(new Date(response.submittedAt))}
                      </time>
                      <span className="draft-badge">
                        Version {response.version}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {(cursors.length > 1 || page.data.nextCursor) && (
              <nav className="pagination" aria-label="Response pages">
                <button
                  className="text-button"
                  disabled={cursors.length === 1 || page.isFetching}
                  onClick={() => setCursors((values) => values.slice(0, -1))}
                >
                  Previous
                </button>
                <span>Page {cursors.length}</span>
                <button
                  className="text-button"
                  disabled={!page.data.nextCursor || page.isFetching}
                  onClick={() =>
                    setCursors((values) => [
                      ...values,
                      page.data.nextCursor ?? undefined,
                    ])
                  }
                >
                  Next
                </button>
              </nav>
            )}
          </section>
          <section
            className="response-detail"
            aria-label="Response details"
            aria-busy={detail.isFetching}
          >
            {!selected ? (
              <div className="response-placeholder">
                <p className="eyebrow">THE WHOLE PICTURE</p>
                <h2>Select a response.</h2>
                <p>Read the answers alongside their original questions.</p>
              </div>
            ) : detail.isPending ? (
              <p role="status">Opening response…</p>
            ) : detail.isError ? (
              <>
                <h2>Response unavailable</h2>
                <p role="alert">{detail.error.message}</p>
                <button
                  className="text-button"
                  onClick={() => void detail.refetch()}
                >
                  Try again
                </button>
              </>
            ) : (
              detail.data && (
                <>
                  <p className="eyebrow">
                    RECEIVED · VERSION {detail.data.version}
                  </p>
                  <h2 ref={heading} tabIndex={-1}>
                    {detail.data.definition.title}
                  </h2>
                  <p>
                    <time dateTime={detail.data.submittedAt}>
                      {dates.format(new Date(detail.data.submittedAt))}
                    </time>
                  </p>
                  <p className="response-full-reference">
                    Reference {detail.data.id}
                  </p>
                  {can(page.data.role, 'responses.export') && (
                    <div className="response-export">
                      <a
                        className="text-button"
                        href={responseExportPath(
                          workspaceId,
                          formId,
                          detail.data.versionId,
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Download version ${detail.data.version} CSV (opens in a new tab)`}
                      >
                        Download version {detail.data.version} CSV
                      </a>
                      <p>
                        All completed responses for this published version.
                        Potential formulas are exported as text.
                      </p>
                    </div>
                  )}
                  <dl className="response-answers">
                    {detail.data.definition.pages
                      .flatMap((page) => page.blocks)
                      .flatMap((block) =>
                        'label' in block ? (
                          <div key={block.id}>
                            <dt>{block.label}</dt>
                            <dd>
                              {formatResponseAnswer(
                                block,
                                detail.data.answers[block.id],
                              )}
                            </dd>
                          </div>
                        ) : (
                          []
                        ),
                      )}
                  </dl>
                </>
              )
            )}
          </section>
        </div>
      )}
    </div>
  );
}
