import OpenAI from "openai";
import { and, asc, inArray, isNull } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { entities as entitiesTable, VECTOR_DIMENSIONS } from "../db/schema.js";
import {
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_EMBEDDING_PROVIDER,
  getEmbeddingSettings,
  previewSecret
} from "./embedding_settings.js";
import { setBodyVec } from "./entities.js";
import { DEFAULT_SCOPE, type Scope } from "./scope.js";
import type { EmbeddingProvider } from "./types.js";

export const EMBED_MODEL = DEFAULT_EMBEDDING_MODEL;
export const EMBED_DIM = VECTOR_DIMENSIONS;

export interface EmbedFn {
  (text: string): Promise<number[]>;
}

/** Embeds several texts in one provider round-trip; output order matches input. */
export interface EmbedBatchFn {
  (texts: string[]): Promise<number[][]>;
}

// OpenAI accepts an input array; a 4k-row backfill becomes ~40 calls instead
// of 4k. The character cap keeps a batch well under the request token budget.
export const EMBED_BATCH_MAX_TEXTS = 100;
export const EMBED_BATCH_MAX_CHARS = 200_000;
const MAX_ATTEMPTS = 3;

interface Job {
  id: string;
  text: string;
  attempts: number;
  /** Retried alone after its batch failed, so one bad text cannot poison the others. */
  solo: boolean;
}

export interface EmbeddingRuntimeStatus {
  enabled: boolean;
  provider: EmbeddingProvider;
  model: string;
  baseUrl: string | null;
  dimensions: number;
  apiKeyConfigured: boolean;
  apiKeySource: "settings" | "environment" | "injected" | null;
  apiKeyPreview: string | null;
  reason:
    | "ready"
    | "disabled"
    | "missing_api_key"
    | "missing_base_url"
    | "injected"
    | "not_loaded";
}

function assertVector(vec: number[] | undefined): number[] {
  if (!vec) throw new Error("embedding provider returned no embedding");
  if (vec.length !== EMBED_DIM) {
    throw new Error(`embedding provider returned ${vec.length} dimensions; expected ${EMBED_DIM}`);
  }
  return vec;
}

/**
 * Embedding worker. The queue is in-memory on purpose (a restart drops it);
 * durability comes from `enqueueMissing`, which the daemon runs at start and on
 * a periodic sweep so rows left with body_vec NULL are always picked up again.
 */
export class EmbeddingService {
  private embedBatch: EmbedBatchFn | null;
  private injected = false;
  private queue: Job[] = [];
  private pending = new Map<string, Job>();
  private inFlight = new Set<string>();
  private working = false;
  private envApiKey: string | undefined;
  /** The daemon runs one embedding worker; its provider config is read from
   *  this workspace's embedding_settings row (the default workspace today). */
  private scope: Scope;
  private status: EmbeddingRuntimeStatus = {
    enabled: false,
    provider: DEFAULT_EMBEDDING_PROVIDER,
    model: DEFAULT_EMBEDDING_MODEL,
    baseUrl: null,
    dimensions: EMBED_DIM,
    apiKeyConfigured: false,
    apiKeySource: null,
    apiKeyPreview: null,
    reason: "not_loaded"
  };

  constructor(
    private db: Database["db"],
    opts: {
      apiKey?: string | undefined;
      embedFn?: EmbedFn;
      embedBatchFn?: EmbedBatchFn;
      logger?: (msg: string) => void;
      scope?: Scope;
    } = {}
  ) {
    this.envApiKey = opts.apiKey;
    this.scope = opts.scope ?? DEFAULT_SCOPE;
    this.log = opts.logger ?? (() => undefined);
    const single = opts.embedFn;
    if (opts.embedBatchFn || single) {
      this.injected = true;
      this.embedBatch =
        opts.embedBatchFn ?? ((texts) => Promise.all(texts.map((t) => single!(t))));
      this.status = {
        enabled: true,
        provider: DEFAULT_EMBEDDING_PROVIDER,
        model: EMBED_MODEL,
        baseUrl: null,
        dimensions: EMBED_DIM,
        apiKeyConfigured: true,
        apiKeySource: "injected",
        apiKeyPreview: "injected",
        reason: "injected"
      };
    } else {
      this.embedBatch = null;
    }
  }

  private log: (msg: string) => void;

  setLogger(logger: (msg: string) => void): void {
    this.log = logger;
  }

  async reloadConfig(): Promise<EmbeddingRuntimeStatus> {
    if (this.injected) return this.status;

    const settings = await getEmbeddingSettings(this.scope, this.db);
    const settingsKey = settings.apiKey?.trim() || null;
    const envKey = this.envApiKey?.trim() || null;
    const apiKey = settingsKey ?? envKey;
    const apiKeySource = settingsKey ? "settings" : envKey ? "environment" : null;
    const provider: EmbeddingProvider =
      settings.provider === "openai_compatible" ? "openai_compatible" : "openai";
    const model = settings.model.trim() || EMBED_MODEL;
    const baseUrl = settings.baseUrl?.trim() || null;

    if (!settings.enabled) {
      this.embedBatch = null;
      this.status = {
        enabled: false,
        provider,
        model,
        baseUrl,
        dimensions: EMBED_DIM,
        apiKeyConfigured: Boolean(apiKey),
        apiKeySource,
        apiKeyPreview: previewSecret(apiKey),
        reason: "disabled"
      };
      return this.status;
    }

    if (!apiKey) {
      this.embedBatch = null;
      this.status = {
        enabled: false,
        provider,
        model,
        baseUrl,
        dimensions: EMBED_DIM,
        apiKeyConfigured: false,
        apiKeySource: null,
        apiKeyPreview: null,
        reason: "missing_api_key"
      };
      return this.status;
    }

    if (provider === "openai_compatible" && !baseUrl) {
      this.embedBatch = null;
      this.status = {
        enabled: false,
        provider,
        model,
        baseUrl,
        dimensions: EMBED_DIM,
        apiKeyConfigured: true,
        apiKeySource,
        apiKeyPreview: previewSecret(apiKey),
        reason: "missing_base_url"
      };
      return this.status;
    }

    const client = new OpenAI({
      apiKey,
      ...(provider === "openai_compatible" && baseUrl ? { baseURL: baseUrl } : {})
    });
    this.embedBatch = async (texts) => {
      const res = await client.embeddings.create({
        model,
        input: texts,
        dimensions: EMBED_DIM
      });
      if (res.data.length !== texts.length) {
        throw new Error(
          `embedding provider returned ${res.data.length} embeddings for ${texts.length} inputs`
        );
      }
      const ordered = [...res.data].sort((a, b) => a.index - b.index);
      return ordered.map((d) => assertVector(d.embedding));
    };
    this.status = {
      enabled: true,
      provider,
      model,
      baseUrl,
      dimensions: EMBED_DIM,
      apiKeyConfigured: true,
      apiKeySource,
      apiKeyPreview: previewSecret(apiKey),
      reason: "ready"
    };
    return this.status;
  }

  runtimeStatus(): EmbeddingRuntimeStatus {
    return this.status;
  }

  isEnabled(): boolean {
    return this.embedBatch != null;
  }

  /** Queue one entity; a second call for an id still waiting replaces its text. */
  enqueue(id: string, text: string): void {
    this.add(id, text);
    this.tick();
  }

  private add(id: string, text: string): boolean {
    if (!this.embedBatch) return false;
    if (!text.trim()) return false;
    const waiting = this.pending.get(id);
    if (waiting) {
      waiting.text = text;
      return false;
    }
    const job: Job = { id, text, attempts: 0, solo: false };
    this.queue.push(job);
    this.pending.set(id, job);
    return true;
  }

  async embedQuery(text: string): Promise<number[] | null> {
    if (!this.embedBatch) return null;
    if (!text.trim()) return null;
    try {
      const [vec] = await this.embedBatch([text]);
      return assertVector(vec);
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
    return this.queue.length + this.inFlight.size;
  }

  /**
   * Queue every task/note whose body_vec is still NULL, oldest first, skipping
   * ids already waiting or in flight. Safe to call repeatedly: the daemon runs
   * it at start and on a periodic sweep, which also retries rows the worker
   * gave up on earlier.
   */
  async enqueueMissing(limit = 100000): Promise<{ enqueued: number; pendingCount: number }> {
    if (!this.embedBatch) return { enqueued: 0, pendingCount: this.pendingCount() };
    const rows = await this.db
      .select({
        id: entitiesTable.id,
        title: entitiesTable.title,
        body: entitiesTable.body
      })
      .from(entitiesTable)
      .where(
        and(inArray(entitiesTable.kind, ["task", "note"]), isNull(entitiesTable.bodyVec))
      )
      .orderBy(asc(entitiesTable.createdAt))
      .limit(limit);

    let enqueued = 0;
    for (const row of rows) {
      if (this.pending.has(row.id) || this.inFlight.has(row.id)) continue;
      if (this.add(row.id, `${row.title ?? ""}\n${row.body}`.trim())) enqueued++;
    }
    this.tick();
    return { enqueued, pendingCount: this.pendingCount() };
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

  private takeBatch(): Job[] {
    const batch: Job[] = [];
    let chars = 0;
    while (this.queue.length > 0) {
      const next = this.queue[0]!;
      if (batch.length > 0 && (next.solo || chars + next.text.length > EMBED_BATCH_MAX_CHARS)) break;
      this.queue.shift();
      this.pending.delete(next.id);
      this.inFlight.add(next.id);
      batch.push(next);
      chars += next.text.length;
      if (next.solo || batch.length >= EMBED_BATCH_MAX_TEXTS) break;
    }
    return batch;
  }

  private async process(): Promise<void> {
    while (this.queue.length > 0) {
      const embedBatch = this.embedBatch;
      if (!embedBatch) return;
      const batch = this.takeBatch();
      if (batch.length === 0) break;
      try {
        const vectors = await embedBatch(batch.map((j) => j.text));
        if (vectors.length !== batch.length) {
          throw new Error(`got ${vectors.length} embeddings for ${batch.length} texts`);
        }
        await Promise.all(
          batch.map((job, i) => setBodyVec(this.db, job.id, assertVector(vectors[i])))
        );
        for (const job of batch) this.inFlight.delete(job.id);
      } catch (err) {
        let maxAttempts = 0;
        for (const job of batch) {
          this.inFlight.delete(job.id);
          job.attempts += 1;
          maxAttempts = Math.max(maxAttempts, job.attempts);
          if (job.attempts >= MAX_ATTEMPTS) {
            this.log(
              `giving up on ${job.id} after ${job.attempts} attempts (the periodic sweep retries it): ${err}`
            );
            continue;
          }
          job.solo = true;
          if (!this.pending.has(job.id)) {
            this.queue.push(job);
            this.pending.set(job.id, job);
          }
        }
        if (batch.some((j) => j.attempts < MAX_ATTEMPTS)) {
          this.log(`retry ${maxAttempts}/${MAX_ATTEMPTS} for ${batch.length} row(s): ${err}`);
          await new Promise((r) => setTimeout(r, 200 * 2 ** maxAttempts));
        }
      }
    }
  }
}
