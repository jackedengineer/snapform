import { intakeProgressSchema } from '@snapform/contracts/intake-progress';
import type {
  IntakeRecovery,
  IntakeMutation,
  IntakeMutationReceipt,
} from '@snapform/contracts/intake-progress';
import type { Answer } from '@snapform/contracts/answers';
import { IntakeRequestError } from './api';
type Status =
  | 'saved'
  | 'waiting'
  | 'saving'
  | 'offline'
  | 'conflict'
  | 'blocked'
  | 'submitted';
export type ProgressState = {
  record: IntakeRecovery;
  status: Status;
  storageError: boolean;
  message: string;
};
type Ports = {
  persist: (record: IntakeRecovery) => Promise<void>;
  send: (
    input: IntakeMutation,
    kind: 'save' | 'submit',
  ) => Promise<IntakeMutationReceipt>;
  changed: (state: ProgressState) => void;
};
export class IntakeProgress {
  state: ProgressState;
  private acknowledged: string;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private localTimer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> | null = null;
  private persistence: Promise<void> = Promise.resolve();
  private closed = false;
  private retryAt = 0;
  private validationFailed = false;
  constructor(
    record: IntakeRecovery,
    acknowledged: Record<string, Answer>,
    private ports: Ports,
  ) {
    this.state = {
      record: structuredClone(record),
      status:
        record.session?.status === 'submitted'
          ? 'submitted'
          : record.pending ||
              JSON.stringify(record.session?.answers) !==
                JSON.stringify(acknowledged)
            ? 'waiting'
            : 'saved',
      storageError: false,
      message: '',
    };
    this.acknowledged = JSON.stringify(acknowledged);
  }
  private emit() {
    if (!this.closed) this.ports.changed({ ...this.state });
  }
  private schedule() {
    clearTimeout(this.timer);
    if (!this.closed && this.state.status === 'waiting')
      this.timer = setTimeout(() => void this.flush(), 1500);
  }
  private persist() {
    const record = structuredClone(this.state.record);
    this.persistence = this.persistence.then(async () => {
      try {
        await this.ports.persist(record);
        this.state.storageError = false;
      } catch {
        this.state.storageError = true;
      }
      this.emit();
    });
    return this.persistence;
  }
  edit(answers: Record<string, Answer>) {
    const session = this.state.record.session;
    if (
      this.closed ||
      !session ||
      ['submitted', 'blocked', 'conflict'].includes(this.state.status) ||
      this.state.record.pending?.kind === 'submit'
    )
      return;
    if (this.validationFailed) {
      this.validationFailed = false;
      this.state.status = 'waiting';
      this.state.message = '';
    }
    this.state.record = {
      ...this.state.record,
      session: { ...session, answers: structuredClone(answers) },
    };
    if (!['saving', 'offline'].includes(this.state.status))
      this.state.status =
        JSON.stringify(answers) === this.acknowledged ? 'saved' : 'waiting';
    this.emit();
    clearTimeout(this.localTimer);
    this.localTimer = setTimeout(() => void this.persist(), 120);
    this.schedule();
  }
  flush(): Promise<void> {
    clearTimeout(this.timer);
    if (
      this.closed ||
      ['saved', 'submitted', 'blocked', 'conflict'].includes(
        this.state.status,
      ) ||
      Date.now() < this.retryAt
    )
      return Promise.resolve();
    if (this.running) return this.running;
    this.running = this.save().finally(() => {
      this.running = null;
      this.schedule();
    });
    return this.running;
  }
  private async save() {
    const session = this.state.record.session;
    if (!session) return;
    const pending = this.state.record.pending || {
      kind: 'save' as const,
      input: {
        operationId: crypto.randomUUID(),
        expectedRevision: session.revision,
        answers: intakeProgressSchema.parse(session.answers),
      },
    };
    this.state.record = {
      ...this.state.record,
      pending: structuredClone(pending),
    };
    this.state.status = 'saving';
    this.state.message = '';
    this.emit();
    clearTimeout(this.localTimer);
    await this.persist();
    if (this.closed) return;
    try {
      const receipt = await this.ports.send(pending.input, pending.kind);
      if (receipt.currentRevision !== receipt.revision) {
        this.state.status = 'conflict';
        this.state.message =
          'The saved response has newer changes. Your unsent answers remain here.';
        this.emit();
        return;
      }
      this.acknowledged = JSON.stringify(pending.input.answers);
      const latest = this.state.record.session;
      if (!latest) return;
      this.state.record = {
        ...this.state.record,
        pending: null,
        session: {
          ...latest,
          revision: receipt.revision,
          status: receipt.status,
        },
      };
      this.state.status =
        receipt.status === 'submitted'
          ? 'submitted'
          : JSON.stringify(latest.answers) === this.acknowledged
            ? 'saved'
            : 'waiting';
      await this.persist();
    } catch (error) {
      this.state.message =
        error instanceof IntakeRequestError
          ? error.message
          : 'Your answers are still here. Try saving again.';
      const code =
        error instanceof IntakeRequestError ? error.code : 'unavailable';
      this.state.status =
        code === 'conflict'
          ? 'conflict'
          : ['expired', 'quota'].includes(code)
            ? 'blocked'
            : 'offline';
      if (code === 'rate-limited') this.retryAt = Date.now() + 60000;
      if (code === 'invalid') {
        this.validationFailed = true;
        this.state.record = { ...this.state.record, pending: null };
        this.state.status = 'waiting';
        await this.persist();
        this.state.status = 'offline';
      }
    }
    this.emit();
  }
  async submit() {
    await this.flush();
    if (
      this.closed ||
      this.running ||
      this.state.status !== 'saved' ||
      !this.state.record.session
    )
      return false;
    const session = this.state.record.session;
    this.state.record = {
      ...this.state.record,
      pending: {
        kind: 'submit',
        input: {
          operationId: crypto.randomUUID(),
          expectedRevision: session.revision,
          answers: intakeProgressSchema.parse(session.answers),
        },
      },
    };
    this.state.status = 'waiting';
    await this.flush();
    return this.state.record.session?.status === 'submitted';
  }
  async close() {
    this.closed = true;
    clearTimeout(this.timer);
    clearTimeout(this.localTimer);
    await this.running;
    await this.persist();
  }
}
