import type {
  Actor,
  CreateProjectInput,
  Entity,
  OpeningBriefResponse,
  Project,
  RecentInput,
  SearchInput,
  SearchResponse,
  UpdateEntityInput,
  WriteEntityInput
} from "./types";

const BASE_URL = "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      // ignore
    }
    throw new Error(`${init?.method ?? "GET"} ${path} -> ${res.status} ${detail}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  health: () => request<{ ok: boolean; version: string }>("/health"),

  listProjects: () => request<Project[]>("/v1/projects"),
  getProject: (id: string) => request<Project>(`/v1/projects/${id}`),
  getProjectByKey: (key: string) =>
    request<Project>(`/v1/projects/by-key/${encodeURIComponent(key)}`),
  createProject: (input: CreateProjectInput) =>
    request<Project>("/v1/projects", { method: "POST", body: JSON.stringify(input) }),
  getAgentsMd: (id: string) =>
    request<{ agentsMd: string }>(`/v1/projects/${id}/agents-md`),
  setAgentsMd: (id: string, agentsMd: string) =>
    request<Project>(`/v1/projects/${id}/agents-md`, {
      method: "PUT",
      body: JSON.stringify({ agentsMd })
    }),
  openingBrief: (id: string, recentLimit = 10) =>
    request<OpeningBriefResponse>(`/v1/projects/${id}/opening-brief`, {
      method: "POST",
      body: JSON.stringify({ recentLimit })
    }),

  getEntity: (id: string) => request<Entity>(`/v1/entities/${id}`),
  writeEntity: (input: WriteEntityInput) =>
    request<Entity>("/v1/entities", { method: "POST", body: JSON.stringify(input) }),
  updateEntity: (id: string, fields: UpdateEntityInput) =>
    request<Entity>(`/v1/entities/${id}`, {
      method: "PATCH",
      body: JSON.stringify(fields)
    }),

  recent: (input: RecentInput = {}) =>
    request<Entity[]>("/v1/recent", { method: "POST", body: JSON.stringify(input) }),

  search: (input: SearchInput) =>
    request<SearchResponse>("/v1/search", { method: "POST", body: JSON.stringify(input) }),

  ensureActor: (input: { name: string; kind: "human" | "agent" | "system"; key?: string }) =>
    request<Actor>("/v1/actors", { method: "POST", body: JSON.stringify(input) })
};
