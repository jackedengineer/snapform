import type { LocalDraft, SaveDraft } from '@snapform/contracts/draft';
import type { FormDefinition } from '@snapform/contracts/form';
import { FormRequestError } from './api';
type Receipt = { revision: number; currentRevision: number };
export type AutosaveStatus =
  'saved' | 'waiting' | 'saving' | 'offline' | 'conflict' | 'blocked';
export type AutosaveState = {
  record: LocalDraft;
  status: AutosaveStatus;
  storageError: boolean;
  buffered: boolean;
  message: string;
};
type Ports = {
  persist: (record: LocalDraft) => Promise<void>;
  send: (input: SaveDraft, signal: AbortSignal) => Promise<Receipt>;
  changed: (state: AutosaveState) => void;
};
export function definitionKey(definition: FormDefinition) {
  const { rules, ...values } = definition;
  return JSON.stringify({ ...values, rules });
}
export class DraftAutosave {
  state: AutosaveState;
  private acknowledged: string;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> | null = null;
  private closed = false;
  private retryAt = 0;
  private validationFailed = false;
  private abort = new AbortController();
  constructor(
    initial: LocalDraft,
    private ports: Ports,
  ) {
    this.state = {
      record: structuredClone(initial),
      status: 'saved',
      storageError: false,
      buffered: false,
      message: '',
    };
    this.acknowledged = definitionKey(initial.definition);
  }
  private emit() {
    if (!this.closed) this.ports.changed({ ...this.state });
  }
  private schedule() {
    clearTimeout(this.timer);
    if (!this.closed && this.state.status === 'waiting')
      this.timer = setTimeout(() => void this.flush(), 750);
  }
  private async persist() {
    const record = structuredClone(this.state.record);
    try {
      await this.ports.persist(record);
      if (this.closed) return;
      this.state.storageError = false;
      this.state.buffered =
        definitionKey(record.definition) ===
        definitionKey(this.state.record.definition);
    } catch {
      if (this.closed) return;
      this.state.storageError = true;
      this.state.buffered = false;
    }
    this.emit();
  }
  edit(definition: FormDefinition) {
    if (
      this.closed ||
      definitionKey(definition) === definitionKey(this.state.record.definition)
    )
      return;
    if (this.validationFailed) {
      this.validationFailed = false;
      this.state.status = 'waiting';
      this.state.message = '';
    }
    this.state.record = {
      ...this.state.record,
      definition: structuredClone(definition),
      updatedAt: Date.now(),
    };
    this.state.buffered = false;
    if (
      !['conflict', 'blocked', 'saving', 'offline'].includes(this.state.status)
    )
      this.state.status =
        definitionKey(definition) === this.acknowledged ? 'saved' : 'waiting';
    this.emit();
    void this.persist();
    this.schedule();
  }
  async recover(record: LocalDraft, serverRevision: number) {
    if (this.closed || this.running) return;
    this.validationFailed = false;
    this.state.record = {
      ...structuredClone(record),
      editorId: this.state.record.editorId,
      updatedAt: Date.now(),
    };
    this.state.status =
      record.pending || record.revision === serverRevision
        ? 'waiting'
        : 'conflict';
    this.state.buffered = false;
    this.emit();
    await this.persist();
    this.schedule();
    return this.state.buffered;
  }
  accept(revision: number, definition: FormDefinition) {
    if (this.closed || this.running) return false;
    this.validationFailed = false;
    const backup = this.state.record.definition;
    this.state.record = {
      ...this.state.record,
      revision,
      definition: structuredClone(definition),
      pending: null,
      backup,
      updatedAt: Date.now(),
    };
    this.acknowledged = definitionKey(definition);
    this.state.status = 'saved';
    this.state.message = '';
    this.emit();
    void this.persist();
    return true;
  }
  flush(definition?: FormDefinition): Promise<void> {
    if (definition) this.edit(definition);
    clearTimeout(this.timer);
    if (
      this.closed ||
      ['saved', 'conflict', 'blocked'].includes(this.state.status) ||
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
    const record = this.state.record;
    const operation = record.pending || {
      operationId: crypto.randomUUID(),
      expectedRevision: record.revision,
      definition: structuredClone(record.definition),
    };
    this.state.record = {
      ...record,
      pending: operation,
      updatedAt: Date.now(),
    };
    this.state.status = 'saving';
    this.state.message = '';
    this.emit();
    await this.persist();
    if (this.closed) return;
    try {
      const result = await this.ports.send(operation, this.abort.signal);
      if (this.closed) return;
      if (result.currentRevision !== result.revision) {
        this.state.status = 'conflict';
      } else {
        this.acknowledged = definitionKey(operation.definition);
        this.state.record = {
          ...this.state.record,
          revision: result.revision,
          pending: null,
          updatedAt: Date.now(),
        };
        this.state.status =
          definitionKey(this.state.record.definition) === this.acknowledged
            ? 'saved'
            : 'waiting';
      }
      await this.persist();
    } catch (error) {
      if (this.closed) return;
      const code =
        error instanceof FormRequestError ? error.code : 'unavailable';
      this.state.status =
        code === 'conflict'
          ? 'conflict'
          : ['unauthenticated', 'forbidden', 'not-found', 'invalid'].includes(
                code,
              )
            ? 'blocked'
            : 'offline';
      this.state.message =
        error instanceof FormRequestError
          ? error.message
          : 'We couldn’t confirm that save. Your edits are still here.';
      if (code === 'invalid') {
        // This code is emitted by client validation before any HTTP write is sent.
        const newer =
          definitionKey(this.state.record.definition) !==
          definitionKey(operation.definition);
        this.validationFailed = !newer;
        this.state.record = { ...this.state.record, pending: null };
        if (newer) {
          this.state.status =
            definitionKey(this.state.record.definition) === this.acknowledged
              ? 'saved'
              : 'waiting';
          this.state.message = '';
        }
      }
      if (code === 'rate-limited') this.retryAt = Date.now() + 60000;
      await this.persist();
    }
    this.emit();
  }
  private isSaved() {
    return this.state.status === 'saved';
  }
  async canLeave(definition?: FormDefinition) {
    if (definition) this.edit(definition);
    if (this.closed || this.isSaved()) return true;
    await this.persist();
    if (this.state.status === 'waiting' || this.state.status === 'saving') {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        this.flush(),
        new Promise<void>((resolve) => {
          timeout = setTimeout(resolve, 2000);
        }),
      ]);
      clearTimeout(timeout);
    }
    return this.isSaved() || this.state.buffered;
  }
  close() {
    this.closed = true;
    clearTimeout(this.timer);
    this.abort.abort();
  }
}
