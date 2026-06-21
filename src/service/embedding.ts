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
import type { EmbeddingProvider } from "./types.js";

export const EMBED_MODEL = DEFAULT_EMBEDDING_MODEL;
export const EMBED_DIM = VECTOR_DIMENSIONS;

export interface EmbedFn {
  (text: string): Promise<number[]>;
}

interface Job {
  id: string;
  text: string;
  attempts: number;
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

export class EmbeddingService {
  private embedFn: EmbedFn | null;
  private injected = false;
  private queue: Job[] = [];
  private working = false;
  private envApiKey: string | undefined;
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
      logger?: (msg: string) => void;
    } = {}
  ) {
    this.envApiKey = opts.apiKey;
    if (opts.embedFn) {
      this.injected = true;
      this.embedFn = opts.embedFn;
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
      this.embedFn = null;
    }
    this.log = opts.logger ?? (() => undefined);
  }

  private log: (msg: string) => void;

  async reloadConfig(): Promise<EmbeddingRuntimeStatus> {
    if (this.injected) return this.status;

    const settings = await getEmbeddingSettings(this.db);
    const settingsKey = settings.apiKey?.trim() || null;
    const envKey = this.envApiKey?.trim() || null;
    const apiKey = settingsKey ?? envKey;
    const apiKeySource = settingsKey ? "settings" : envKey ? "environment" : null;
    const provider: EmbeddingProvider =
      settings.provider === "openai_compatible" ? "openai_compatible" : "openai";
    const model = settings.model.trim() || EMBED_MODEL;
    const baseUrl = settings.baseUrl?.trim() || null;

    if (!settings.enabled) {
      this.embedFn = null;
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
      this.embedFn = null;
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
      this.embedFn = null;
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
    this.embedFn = async (text) => {
      const res = await client.embeddings.create({
        model,
        input: text,
        dimensions: EMBED_DIM
      });
      const vec = res.data[0]?.embedding;
      if (!vec) throw new Error("embedding provider returned no embedding");
      if (vec.length !== EMBED_DIM) {
        throw new Error(`embedding provider returned ${vec.length} dimensions; expected ${EMBED_DIM}`);
      }
      return vec;
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

  async enqueueMissing(limit = 100000): Promise<{ enqueued: number; pendingCount: number }> {
    if (!this.embedFn) return { enqueued: 0, pendingCount: this.pendingCount() };
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
      const text = `${row.title ?? ""}\n${row.body}`.trim();
      if (!text) continue;
      this.enqueue(row.id, text);
      enqueued++;
    }
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
