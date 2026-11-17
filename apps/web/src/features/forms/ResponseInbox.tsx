import { useState, useRef, useEffect, useId } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { can } from '@snapform/contracts/workspace';
import {
  formatRelativeTime,
  formatResponseAnswer,
} from '@snapform/contracts/response-display';
import { summarizeResponse } from '@snapform/contracts/responses';
import type {
  ResponseDetail,
  ResponsePage,
} from '@snapform/contracts/responses';
import { useAccountUser } from '../auth/AccountLayout';
import { fetchResponses, fetchResponse, responseExportPath } from './api';
import './responses.css';
import { WebhookSettings } from './WebhookSettings';
import { EmailNotifications } from './EmailNotifications';
import { DeletionControl } from '../deletion/DeletionControl';
import { responseReference } from '../intake/reference';
import { hasFileQuestion } from '@snapform/contracts/uploads';
import { ResponseFiles, useResponseFiles } from './ResponseFiles';
const dates = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeStyle: 'short',
});
const anonymous = 'Anonymous response';
function respondentOf(detail: ResponseDetail) {
  const text = Object.fromEntries(
    Object.entries(detail.answers).flatMap(([id, answer]) =>
      answer.state === 'value' && typeof answer.value === 'string'
        ? [[id, answer.value]]
        : [],
    ),
  );
  return summarizeResponse(detail.definition, text).respondent ?? anonymous;
}
// Per-browser read state: response IDs only, never answers. null means
// storage is unavailable, so no row is marked new rather than every row.
function useOpenedResponses(key: string, openedId?: string) {
  const [opened, setOpened] = useState<ReadonlySet<string> | null>(null);
  useEffect(() => {
    let ids: string[];
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
      ids = Array.isArray(stored)
        ? stored.filter((id): id is string => typeof id === 'string')
        : [];
      if (openedId && !ids.includes(openedId)) {
        ids = [openedId, ...ids].slice(0, 500);
        localStorage.setItem(key, JSON.stringify(ids));
      }
    } catch {
      setOpened(null);
      return;
    }
    setOpened(new Set(ids));
  }, [key, openedId]);
  return opened;
}
function ExportCsv({
  workspaceId,
  formId,
  versions,
}: {
  workspaceId: string;
  formId: string;
  versions: ResponsePage['versions'];
}) {
  const [chosen, setChosen] = useState<string>();
  const selectId = useId();
  const version = versions.find((item) => item.id === chosen) ?? versions[0];
  return (
    <div className="response-export">
      {versions.length > 1 && (
        <div className="response-export-version">
          <label htmlFor={selectId}>Version to export</label>
          <select
            id={selectId}
            value={version.id}
            onChange={(event) => setChosen(event.target.value)}
          >
            {versions.map((item, index) => (
              <option key={item.id} value={item.id}>
                Version {item.number}
                {index === 0 ? ' (latest)' : ''}
              </option>
            ))}
          </select>
        </div>
      )}
      <a
        className="button secondary compact-button"
        href={responseExportPath(workspaceId, formId, version.id)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={
          versions.length > 1
            ? `Export CSV for version ${version.number} (opens in a new tab)`
            : 'Export CSV (opens in a new tab)'
        }
      >
        Export CSV
      </a>
    </div>
  );
}
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
  const [view, setView] = useState<'responses' | 'delivery'>('responses');
  useEffect(() => {
    setView('responses');
  }, [selected]);
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
  const files = useResponseFiles(
    user.id,
    workspaceId,
    formId,
    detail.data?.id,
    Boolean(detail.data && hasFileQuestion(detail.data.definition)),
  );
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (detail.data) heading.current?.focus();
  }, [detail.data]);
  const opened = useOpenedResponses(
    `snapform:opened-responses:${user.id}:${workspaceId}:${formId}`,
    detail.data?.id,
  );
  // Keep the heading stable while another page of responses loads.
  const [title, setTitle] = useState<string>();
  useEffect(() => {
    if (page.data) setTitle(page.data.title || 'Untitled form');
  }, [page.data]);
  const versioned = (page.data?.versions.length ?? 0) > 1;
  const hasResponses =
    cursors.length > 1 || Boolean(page.data?.responses.length);
  const now = Date.now();
  return (
    <div className="workspace-home response-home">
      <Link
        className="back-link"
        to="/workspaces/$workspaceId/forms/$formId"
        params={{ workspaceId, formId }}
      >
        ← Back to form
      </Link>
      <div className="workspace-heading response-heading">
        <div>
          <h1>{title ?? 'Responses'}</h1>
          <p className="intro-copy">
            Completed responses, newest first, with the questions each person
            saw.
          </p>
        </div>
        <div className="response-actions">
          {page.data &&
            hasResponses &&
            page.data.versions.length > 0 &&
            can(page.data.role, 'responses.export') && (
              <ExportCsv
                key={page.data.versions[0].id}
                workspaceId={workspaceId}
                formId={formId}
                versions={page.data.versions}
              />
            )}
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
      </div>
      <nav className="editor-navigation" aria-label="Response views">
        <button
          type="button"
          aria-current={view === 'responses' ? 'page' : undefined}
          onClick={() => setView('responses')}
        >
          Responses
        </button>
        <button
          type="button"
          disabled={!page.data}
          aria-current={view === 'delivery' ? 'page' : undefined}
          onClick={() => setView('delivery')}
        >
          Notifications & webhooks
        </button>
      </nav>
      <div hidden={view !== 'delivery'}>
        {page.data && (
          <EmailNotifications
            key={`${workspaceId}:${formId}`}
            workspaceId={workspaceId}
            formId={formId}
            userId={user.id}
            canManage={can(page.data.role, 'integrations.manage')}
          />
        )}
        {page.data && can(page.data.role, 'integrations.manage') && (
          <WebhookSettings
            key={`webhook:${workspaceId}:${formId}`}
            workspaceId={workspaceId}
            formId={formId}
            userId={user.id}
          />
        )}
      </div>
      <div hidden={view !== 'responses'}>
        {page.isPending ? (
          <p role="status">Loading responses…</p>
        ) : page.isError ? (
          <div className="workspace-empty">
            <h2>Let’s reconnect.</h2>
            <p role="alert">{page.error.message}</p>
          </div>
        ) : (
          <div
            className="response-layout"
            data-empty={!selected && page.data.responses.length === 0}
          >
            <section aria-label="Submitted responses">
              {page.data.responses.length === 0 ? (
                <div className="workspace-empty">
                  <h2>No responses yet.</h2>
                  <p>Share your form link to start collecting.</p>
                  <Link
                    className="button primary compact-button response-share"
                    to="/workspaces/$workspaceId/forms/$formId"
                    params={{ workspaceId, formId }}
                  >
                    Open form to share
                  </Link>
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
                        <span className="response-title">
                          <span className="response-respondent">
                            {response.respondent ?? anonymous}
                          </span>
                          {response.deletionPending ? (
                            <span className="response-new response-deleting">
                              Scheduled for deletion
                            </span>
                          ) : (
                            opened &&
                            !opened.has(response.id) && (
                              <span className="response-new">New</span>
                            )
                          )}
                        </span>
                        {response.preview && (
                          <span className="response-preview">
                            {response.preview}
                          </span>
                        )}
                        <span className="response-meta">
                          <time
                            dateTime={response.submittedAt}
                            title={dates.format(new Date(response.submittedAt))}
                          >
                            {formatRelativeTime(response.submittedAt, now)}
                          </time>
                          {versioned && <span>Version {response.version}</span>}
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
              hidden={!selected && page.data.responses.length === 0}
              className="response-detail"
              aria-label="Response details"
              aria-busy={detail.isFetching}
            >
              {!selected ? (
                <div className="response-placeholder">
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
                    <h2 ref={heading} tabIndex={-1}>
                      {respondentOf(detail.data)}
                    </h2>
                    <p className="response-received">
                      Received{' '}
                      <time dateTime={detail.data.submittedAt}>
                        {dates.format(new Date(detail.data.submittedAt))}
                      </time>
                      {versioned && `, from version ${detail.data.version}`}
                    </p>
                    <p
                      className="response-full-reference"
                      title={detail.data.id}
                    >
                      Reference {responseReference(detail.data.id)}
                    </p>
                    <dl className="response-answers">
                      {detail.data.definition.pages
                        .flatMap((page) => page.blocks)
                        .flatMap((block) =>
                          'label' in block ? (
                            <div key={block.id}>
                              <dt>{block.label}</dt>
                              <dd>
                                {block.type === 'file' ? (
                                  <ResponseFiles
                                    answer={detail.data.answers[block.id]}
                                    files={files.data}
                                    failed={files.isError}
                                    path={{
                                      workspaceId,
                                      formId,
                                      responseId: detail.data.id,
                                    }}
                                  />
                                ) : (
                                  formatResponseAnswer(
                                    block,
                                    detail.data.answers[block.id],
                                  )
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
              {selected &&
                detail.data &&
                !detail.isError &&
                page.data.role === 'owner' && (
                  <DeletionControl
                    key={`deletion:${selected}`}
                    userId={user.id}
                    workspaceId={workspaceId}
                    target={{ kind: 'response', targetId: selected }}
                    confirmation="DELETE"
                    role={page.data.role}
                  />
                )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
