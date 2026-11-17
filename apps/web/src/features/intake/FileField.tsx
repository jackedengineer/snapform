import { useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatFileSize, uploadAccept } from '@snapform/contracts/uploads';
import type { UploadedFile } from '@snapform/contracts/uploads';
import type { Answer } from '@snapform/contracts/answers';
import type { Field } from '@snapform/contracts/form';
import type { IntakeIdentity } from './api';
import {
  cancelled,
  listFiles,
  pickProblem,
  removeFile,
  sendFile,
} from './files';

type Sending = {
  key: string;
  name: string;
  fraction: number;
  abort: () => void;
};
// Loaded only for forms with a file question. Files go one at a time, so each
// finished upload extends the latest answer rather than a stale copy.
export default function FileField({
  block,
  ids,
  publicId,
  identity,
  describedBy,
  invalid,
  onChange,
  onBlur,
}: {
  block: Extract<Field, { type: 'file' }>;
  ids: string[];
  publicId: string;
  identity: IntakeIdentity;
  describedBy?: string;
  invalid: boolean;
  onChange: (answer: Answer) => void;
  onBlur: () => void;
}) {
  const query = useQueryClient(),
    key = ['intake-files', publicId, identity.id],
    listed = useQuery({
      queryKey: key,
      queryFn: () => listFiles(publicId, identity),
    });
  const [sending, setSending] = useState<Sending | null>(null),
    [problem, setProblem] = useState(''),
    [notice, setNotice] = useState(''),
    [over, setOver] = useState(false);
  const latest = useRef(ids);
  latest.current = ids;
  const known = new Map(listed.data?.map((file) => [file.id, file]));
  // A saved answer can name a file this browser has not listed yet.
  const files = ids.map(
    (id) =>
      known.get(id) ?? {
        id,
        name: listed.isPending ? 'Checking file…' : 'Unavailable file',
        size: 0,
      },
  );
  const room = block.maxFiles - ids.length;
  const hint = `answer-${block.id}-files`;
  const save = (next: string[]) => {
    latest.current = next;
    onChange(
      next.length ? { state: 'value', value: next } : { state: 'blank' },
    );
  };
  async function add(picked: File[]) {
    setProblem('');
    for (const file of picked) {
      const issue = pickProblem(file, block.maxFiles - latest.current.length);
      if (issue) {
        setProblem(issue);
        return;
      }
      const upload = sendFile(publicId, identity, block.id, file, (fraction) =>
        setSending((current) => current && { ...current, fraction }),
      );
      setSending({
        key: crypto.randomUUID(),
        name: file.name,
        fraction: 0,
        abort: upload.abort,
      });
      try {
        const stored = await upload.done;
        query.setQueryData<UploadedFile[]>(key, (current = []) => [
          ...current,
          stored,
        ]);
        save([...latest.current, stored.id]);
        setNotice(`“${stored.name}” added.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (message === cancelled) setNotice('Upload cancelled.');
        else setProblem(message);
        void query.invalidateQueries({ queryKey: key });
        return;
      } finally {
        setSending(null);
      }
    }
  }
  async function remove(file: { id: string; name: string }) {
    setProblem('');
    try {
      await removeFile(publicId, identity, file.id);
      query.setQueryData<UploadedFile[]>(key, (current = []) =>
        current.filter((item) => item.id !== file.id),
      );
      save(latest.current.filter((id) => id !== file.id));
      setNotice(`“${file.name}” removed.`);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : '');
    }
  }
  const drop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    if (!sending) void add(Array.from(event.dataTransfer.files));
  };
  return (
    <div
      className="intake-files"
      data-over={over}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(room > 0 && !sending);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
    >
      <input
        id={`answer-${block.id}`}
        type="file"
        accept={uploadAccept}
        multiple={block.maxFiles > 1}
        disabled={room < 1 || Boolean(sending)}
        aria-describedby={[describedBy, hint].filter(Boolean).join(' ')}
        aria-invalid={invalid}
        aria-required={block.required}
        onBlur={onBlur}
        onChange={(event) => {
          const picked = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = '';
          void add(picked);
        }}
      />
      <p id={hint} className="intake-help">
        {room < 1
          ? 'File limit reached. Remove a file to add another.'
          : `Add up to ${block.maxFiles} ${block.maxFiles === 1 ? 'file' : 'files'}, 25 MB each: PDF, images, Word, Excel, PowerPoint, text or CSV. You can also drop files here.`}
      </p>
      {(files.length > 0 || sending) && (
        <ul className="intake-file-list">
          {files.map((file) => (
            <li key={file.id}>
              <span className="intake-file-name">{file.name}</span>
              {file.size > 0 && (
                <span className="intake-file-size">
                  {formatFileSize(file.size)}
                </span>
              )}
              <button
                type="button"
                className="intake-text-button"
                aria-label={`Remove ${file.name}`}
                disabled={Boolean(sending)}
                onClick={() => void remove(file)}
              >
                Remove
              </button>
            </li>
          ))}
          {sending && (
            <li key={sending.key}>
              <span className="intake-file-name">{sending.name}</span>
              <progress
                max={1}
                value={sending.fraction}
                aria-label={`Uploading ${sending.name}`}
              />
              <button
                type="button"
                className="intake-text-button"
                onClick={sending.abort}
              >
                Cancel
              </button>
            </li>
          )}
        </ul>
      )}
      {problem && (
        <p role="alert" className="intake-field-error">
          {problem}
        </p>
      )}
      <p role="status" className="visually-hidden">
        {notice}
      </p>
    </div>
  );
}
