/**
 * HTTP client used by the stdio MCP server to talk to the botnote daemon.
 *
 * The MCP server used to import drizzle and hit the DB directly. That coupled
 * the MCP process to the daemon's machine and required DATABASE_URL. The
 * plugin model needs the MCP to be runnable on any machine — laptop, private
 * network, public — pointing at whichever botnote daemon the user can reach.
 *
 * Auth model mirrors the daemon's:
 *   - direct private-network/localhost: no token required when the daemon trusts it
 *   - through Cloudflare Tunnel: bearer + optional CF Access service token
 */

const VERSION_HEADER = "x-botnote-mcp-version";

export interface HttpClientOptions {
  baseUrl: string;
  token?: string;
  cfAccessClientId?: string;
  cfAccessClientSecret?: string;
  version?: string;
}

export class BotnoteHttpError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body: string
  ) {
    super(`HTTP ${status} ${statusText}: ${body}`);
  }
}

export class BotnoteHttpClient {
  constructor(private opts: HttpClientOptions) {}

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = new URL(path, this.opts.baseUrl);
    const headers: Record<string, string> = {
      accept: "application/json"
    };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (this.opts.token) headers.authorization = `Bearer ${this.opts.token}`;
    if (this.opts.cfAccessClientId) {
      headers["cf-access-client-id"] = this.opts.cfAccessClientId;
    }
    if (this.opts.cfAccessClientSecret) {
      headers["cf-access-client-secret"] = this.opts.cfAccessClientSecret;
    }
    if (this.opts.version) headers[VERSION_HEADER] = this.opts.version;

    const res = await fetch(url.toString(), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new BotnoteHttpError(res.status, res.statusText, text);
    }
    if (res.status === 204) return undefined as T;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("application/json")) return (await res.text()) as T;
    return (await res.json()) as T;
  }

  // ----- projects -----
  listProjects() {
    return this.request<ProjectDTO[]>("GET", "/v1/projects");
  }
  getProject(id: string) {
    return this.request<ProjectDTO>("GET", `/v1/projects/${id}`);
  }
  getProjectByKey(key: string) {
    return this.request<ProjectDTO>("GET", `/v1/projects/by-key/${key}`);
  }
  createProject(body: CreateProjectBody) {
    return this.request<ProjectDTO>("POST", "/v1/projects", body);
  }
  updateProject(id: string, body: UpdateProjectBody) {
    return this.request<ProjectDTO>("PATCH", `/v1/projects/${id}`, body);
  }

  // ----- opening brief -----
  openingBrief(body: { projectId?: string | null; recentLimit?: number }) {
    return this.request<OpeningBriefDTO>("POST", "/v1/opening-brief", body);
  }

  // ----- entities (read) -----
  getEntity(id: string) {
    return this.request<EntityDTO>("GET", `/v1/entities/${id}`);
  }
  getEntityByKey(projectKey: string, seq: number) {
    return this.request<EntityDTO>(
      "GET",
      `/v1/projects/by-key/${projectKey}/entities/by-seq/${seq}`
    );
  }
  listRelated(id: string) {
    return this.request<EntityDTO[]>("GET", `/v1/entities/${id}/related`);
  }
  recent(body: RecentBody) {
    return this.request<EntityDTO[]>("POST", "/v1/recent", body);
  }
  search(body: SearchBody) {
    return this.request<{ hits: SearchHitDTO[]; embeddingUsed: boolean }>(
      "POST",
      "/v1/search",
      body
    );
  }

  // ----- entities (write) -----
  createTask(body: CreateTaskBody) {
    return this.request<EntityDTO>("POST", "/v1/tasks", body);
  }
  remember(body: CreateNoteBody) {
    return this.request<EntityDTO>("POST", "/v1/notes", body);
  }
  updateEntity(id: string, body: UpdateEntityBody) {
    return this.request<EntityDTO>("PATCH", `/v1/entities/${id}`, body);
  }
  link(fromId: string, body: { toId: string; kind: LinkKind }) {
    return this.request<{ created: boolean }>(
      "POST",
      `/v1/entities/${fromId}/links`,
      body
    );
  }
}

// ----- DTO shapes (mirror REST output; intentionally permissive to avoid
//       lockstep with backend changes) -----

export interface ProjectDTO {
  id: string;
  key: string;
  name: string;
  color: string;
  icon: string;
  agentsMd: string;
  createdAt: string;
  updatedAt: string;
}

export interface EntityDTO {
  id: string;
  projectId: string | null;
  kind: "task" | "note";
  title: string | null;
  body: string;
  tags: string[];
  status: string;
  parentId: string | null;
  actorKind: string;
  metadata: Record<string, unknown>;
  dueAt: string | null;
  priority: string;
  pinned: boolean;
  sequenceId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface SearchHitDTO {
  entity: EntityDTO;
  score: number;
}

export interface OpeningBriefDTO {
  project: ProjectDTO | null;
  pinnedNotes: EntityDTO[];
  openTasks: EntityDTO[];
  recentActivity: EntityDTO[];
  agentsMd: string;
  markdown: string;
}

export type LinkKind = "blocks" | "references" | "parent_of";

export interface CreateProjectBody {
  key: string;
  name: string;
  color?: string;
  icon?: string;
  agentsMd?: string;
}

export interface UpdateProjectBody {
  name?: string;
  color?: string;
  icon?: string;
  agentsMd?: string;
}

export interface CreateTaskBody {
  projectId?: string | null;
  title: string;
  body?: string;
  tags?: string[];
  status?: string;
  parentId?: string | null;
  actorKind?: string;
  dueAt?: string | null;
  priority?: string;
  idempotencyKey?: string;
}

export interface CreateNoteBody {
  projectId?: string | null;
  title?: string | null;
  body?: string;
  tags?: string[];
  parentId?: string | null;
  actorKind?: string;
  pinned?: boolean;
  idempotencyKey?: string;
}

export interface UpdateEntityBody {
  title?: string | null;
  body?: string;
  tags?: string[];
  status?: string;
  parentId?: string | null;
  dueAt?: string | null;
  priority?: string;
  pinned?: boolean;
}

export interface RecentBody {
  projectId?: string | null;
  since?: string | null;
  kinds?: string[];
  limit?: number;
}

export interface SearchBody {
  query: string;
  projectId?: string | null;
  kind?: string;
  limit?: number;
}
