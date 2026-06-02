import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type {
  CreateProjectInput,
  EntityKind,
  RecentInput,
  SearchInput,
  UpdateEntityInput,
  WriteEntityInput
} from "./types";

export const POLL_INTERVAL = 30_000;

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: api.listProjects
  });
}

export function useProjectByKey(key: string | undefined) {
  return useQuery({
    queryKey: ["project", "by-key", key],
    queryFn: () => api.getProjectByKey(key!),
    enabled: Boolean(key)
  });
}

export function useOpeningBrief(projectId: string | undefined, opts: { poll?: boolean } = {}) {
  return useQuery({
    queryKey: ["opening-brief", projectId],
    queryFn: () => api.openingBrief(projectId!),
    enabled: Boolean(projectId),
    refetchInterval: opts.poll === false ? false : POLL_INTERVAL
  });
}

export function useEntity(id: string | undefined) {
  return useQuery({
    queryKey: ["entity", id],
    queryFn: () => api.getEntity(id!),
    enabled: Boolean(id)
  });
}

export function useRecent(input: RecentInput, opts: { poll?: boolean } = {}) {
  return useQuery({
    queryKey: ["recent", input],
    queryFn: () => api.recent(input),
    refetchInterval: opts.poll === false ? false : POLL_INTERVAL
  });
}

export function useEntityList(
  projectId: string | undefined,
  kinds: EntityKind[] | null,
  opts: { poll?: boolean } = {}
) {
  return useQuery({
    queryKey: ["entity-list", projectId, kinds],
    queryFn: () =>
      api.recent({
        projectId: projectId ?? null,
        kinds: kinds ?? null,
        limit: 100
      }),
    enabled: Boolean(projectId),
    refetchInterval: opts.poll === false ? false : POLL_INTERVAL
  });
}

export function useSearch(input: SearchInput | null) {
  return useQuery({
    queryKey: ["search", input],
    queryFn: () => api.search(input!),
    enabled: Boolean(input && input.query.length > 0)
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProjectInput) => api.createProject(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
    }
  });
}

export function useWriteEntity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: WriteEntityInput) => api.writeEntity(input),
    onSuccess: (entity) => {
      qc.invalidateQueries({ queryKey: ["entity-list", entity.projectId ?? undefined] });
      qc.invalidateQueries({ queryKey: ["opening-brief", entity.projectId ?? undefined] });
      qc.invalidateQueries({ queryKey: ["recent"] });
    }
  });
}

export function useUpdateEntity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, fields }: { id: string; fields: UpdateEntityInput }) =>
      api.updateEntity(id, fields),
    onSuccess: (entity) => {
      qc.invalidateQueries({ queryKey: ["entity", entity.id] });
      qc.invalidateQueries({ queryKey: ["entity-list", entity.projectId ?? undefined] });
      qc.invalidateQueries({ queryKey: ["opening-brief", entity.projectId ?? undefined] });
    }
  });
}

export function useSetAgentsMd() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, agentsMd }: { id: string; agentsMd: string }) =>
      api.setAgentsMd(id, agentsMd),
    onSuccess: (project) => {
      qc.invalidateQueries({ queryKey: ["project", "by-key", project.key] });
      qc.invalidateQueries({ queryKey: ["opening-brief", project.id] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    }
  });
}
