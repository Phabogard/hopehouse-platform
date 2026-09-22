import type { OutboxRelay } from './outbox.js';

export interface OutboxWorkerOptions {
  readonly intervalMs?: number;
  readonly onError?: (error: unknown) => void;
}

export class OutboxWorker {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  constructor(
    private readonly relay: Pick<OutboxRelay, 'processBatch'>,
    private readonly options: OutboxWorkerOptions = {},
  ) {}

  get isRunning(): boolean {
    return this.running;
  }

  async processOnce(): Promise<number> {
    return this.relay.processBatch();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.run();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private async run(): Promise<void> {
    if (!this.running) return;

    try {
      await this.processOnce();
    } catch (error) {
      this.options.onError?.(error);
    } finally {
      if (this.running) {
        this.timer = setTimeout(() => {
          this.timer = null;
          void this.run();
        }, this.options.intervalMs ?? 1_000);
      }
    }
  }
}
