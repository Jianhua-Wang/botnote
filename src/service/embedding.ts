import OpenAI from "openai";
import type { Database } from "../db/client.js";
import { setBodyVec } from "./entities.js";

export const EMBED_MODEL = "text-embedding-3-small";
export const EMBED_DIM = 384;

export interface EmbedFn {
  (text: string): Promise<number[]>;
}

interface Job {
  id: string;
  text: string;
  attempts: number;
}

export class EmbeddingService {
  private embedFn: EmbedFn | null;
  private queue: Job[] = [];
  private working = false;

  constructor(
    private db: Database["db"],
    opts: {
      apiKey?: string | undefined;
      embedFn?: EmbedFn;
      logger?: (msg: string) => void;
    } = {}
  ) {
    if (opts.embedFn) {
      this.embedFn = opts.embedFn;
    } else if (opts.apiKey) {
      const client = new OpenAI({ apiKey: opts.apiKey });
      this.embedFn = async (text) => {
        const res = await client.embeddings.create({
          model: EMBED_MODEL,
          input: text,
          dimensions: EMBED_DIM
        });
        const vec = res.data[0]?.embedding;
        if (!vec) throw new Error("openai returned no embedding");
        return vec;
      };
    } else {
      this.embedFn = null;
    }
    this.log = opts.logger ?? ((msg) => console.log(`[embed] ${msg}`));
  }

  private log: (msg: string) => void;

  isEnabled(): boolean {
    return this.embedFn != null;
  }

  enqueue(id: string, text: string): void {
    if (!this.embedFn) return;
    if (!text.trim()) return;
    this.queue.push({ id, text, attempts: 0 });
    this.tick();
  }

  async embedQuery(text: string): Promise<number[] | null> {
    if (!this.embedFn) return null;
    if (!text.trim()) return null;
    try {
      return await this.embedFn(text);
    } catch (err) {
      this.log(`query embed failed: ${err}`);
      return null;
    }
  }

  async drain(timeoutMs = 30000): Promise<void> {
    const start = Date.now();
    while (this.queue.length > 0 || this.working) {
      if (Date.now() - start > timeoutMs) {
        throw new Error(`drain timeout after ${timeoutMs}ms; ${this.queue.length} jobs pending`);
      }
      await new Promise((r) => setTimeout(r, 20));
    }
  }

  pendingCount(): number {
    return this.queue.length + (this.working ? 1 : 0);
  }

  private tick(): void {
    if (this.working) return;
    if (this.queue.length === 0) return;
    this.working = true;
    this.process()
      .catch((e) => this.log(`worker crashed: ${e}`))
      .finally(() => {
        this.working = false;
        if (this.queue.length > 0) setImmediate(() => this.tick());
      });
  }

  private async process(): Promise<void> {
    const embedFn = this.embedFn;
    if (!embedFn) return;
    while (this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job) break;
      try {
        const vec = await embedFn(job.text);
        await setBodyVec(this.db, job.id, vec);
      } catch (err) {
        job.attempts += 1;
        if (job.attempts >= 3) {
          this.log(`failed permanently for ${job.id}: ${err}`);
        } else {
          this.log(`retry ${job.attempts}/3 for ${job.id}: ${err}`);
          const backoff = 200 * 2 ** job.attempts;
          await new Promise((r) => setTimeout(r, backoff));
          this.queue.push(job);
        }
      }
    }
  }
}
