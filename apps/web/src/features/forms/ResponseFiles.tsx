import { useQuery } from '@tanstack/react-query';
import {
  formatFileSize,
  uploadedFilesSchema,
} from '@snapform/contracts/uploads';
import type { Answer } from '@snapform/contracts/answers';
import { request } from './api';

// Members download through the authenticated API only: the route answers with
// an attachment, so a file never renders inside Snapform.
const filesPath = (workspaceId: string, formId: string, responseId: string) =>
  `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/forms/${encodeURIComponent(formId)}/responses/${encodeURIComponent(responseId)}/files`;
export function useResponseFiles(
  userId: string,
  workspaceId: string,
  formId: string,
  responseId: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['response-files', userId, workspaceId, formId, responseId],
    enabled: enabled && Boolean(responseId),
    queryFn: ({ signal }) =>
      request(
        filesPath(workspaceId, formId, responseId ?? ''),
        { signal },
        (value) =>
          uploadedFilesSchema.parse(
            typeof value === 'object' && value !== null && 'files' in value
              ? value.files
              : null,
          ),
      ),
  });
}
export function ResponseFiles({
  answer,
  files,
  failed,
  path,
}: {
  answer?: Answer;
  files?: readonly { id: string; name: string; size: number }[];
  failed: boolean;
  path: { workspaceId: string; formId: string; responseId: string };
}) {
  if (answer?.state !== 'value' || !Array.isArray(answer.value))
    return answer?.state === 'refused' ? 'Prefer not to answer' : 'No files';
  if (failed) return 'Files couldn’t be loaded. Refresh to try again.';
  if (!files) return 'Loading files…';
  return (
    <ul className="response-files">
      {answer.value.map((id) => {
        const file = files.find((item) => item.id === id);
        return (
          <li key={id}>
            {file ? (
              <>
                <span className="response-file-name">{file.name}</span>{' '}
                <span className="response-file-size">
                  {formatFileSize(file.size)}
                </span>{' '}
                <a
                  href={`${filesPath(path.workspaceId, path.formId, path.responseId)}/${encodeURIComponent(id)}`}
                  download={file.name}
                  aria-label={`Download ${file.name}`}
                >
                  Download
                </a>
              </>
            ) : (
              'Unavailable file'
            )}
          </li>
        );
      })}
    </ul>
  );
}
