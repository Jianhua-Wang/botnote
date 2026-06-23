#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { VERSION } from "./version.js";

// Public botnote.net is the right default for fresh remote installs (the most
// common npm-install case). On the daemon host itself, `botnote login` writes
// a config that pins http://127.0.0.1:4280 so loopback stays loopback.
const DEFAULT_BASE_URL = "https://botnote.net";

interface BotnoteConfig {
  baseUrl: string;
  token?: string;
}

function configDir(): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
  const xdg = process.env.XDG_CONFIG_HOME;
  return xdg ? path.join(xdg, "botnote") : path.join(home, ".config", "botnote");
}

function configPath(): string {
  return path.join(configDir(), "config.json");
}

function readConfig(): BotnoteConfig {
  const p = configPath();
  const envBaseUrl = process.env.BOTNOTE_URL;
  const envToken = process.env.BOTNOTE_TOKEN;
  if (!existsSync(p)) {
    return { baseUrl: envBaseUrl ?? DEFAULT_BASE_URL, token: envToken };
  }
  try {
    const raw = JSON.parse(readFileSync(p, "utf8")) as Partial<BotnoteConfig>;
    return {
      baseUrl: envBaseUrl ?? raw.baseUrl ?? DEFAULT_BASE_URL,
      token: envToken ?? raw.token
    };
  } catch {
    return { baseUrl: envBaseUrl ?? DEFAULT_BASE_URL, token: envToken };
  }
}

function writeConfig(cfg: BotnoteConfig): void {
  const dir = configDir();
  mkdirSync(dir, { recursive: true });
  writeFileSync(configPath(), JSON.stringify(cfg, null, 2), { mode: 0o600 });
}

async function callApi<T>(
  method: string,
  path: string,
  body?: unknown,
  opts: { allowNoAuth?: boolean } = {}
): Promise<T> {
  const cfg = readConfig();
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cfg.token) headers.authorization = `Bearer ${cfg.token}`;
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  if (res.status === 401 && !opts.allowNoAuth) {
    console.error(
      "401 unauthorized — run `botnote login` and paste a token from Settings → API tokens."
    );
    process.exit(1);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function usage(): string {
  return `botnote ${VERSION}

Usage:
  botnote login                            Save a token to ~/.config/botnote/config.json
  botnote logout                           Wipe the saved token
  botnote whoami                           Show config status

  botnote serve                            Run the REST + web daemon (same as: node dist/cli.js)
  botnote mcp                              Run the MCP stdio server (for plugin/agent integration)

  botnote projects                         List projects
  botnote today                            Show today + overdue tasks
  botnote tasks [--status open]            List tasks
  botnote task "<title>" [--project KEY] [--due YYYY-MM-DD] [--priority P]
                       [--repeat hourly|daily|weekly|monthly|yearly] [--interval N]
                       [--on MO,WE] [--anchor scheduled|completion]
                       [--count N] [--until YYYY-MM-DD]
                                           Create a task
  botnote note "<body>" [--project KEY] [--pin]
                                           Create a note (no title)
  botnote recurrence TASK                  Show recurrence for a task
  botnote skip TASK [--reason "..."]       Skip current recurring occurrence
  botnote stop-recurrence TASK             Stop a task's recurrence series
  botnote search "<query>" [--limit 10]    Hybrid search

Env:
  BOTNOTE_URL   override the server base URL (default ${DEFAULT_BASE_URL})
  BOTNOTE_TOKEN override the saved bearer token

Config: ${configPath()}
`;
}

interface Args {
  positional: string[];
  flags: Record<string, string | true>;
}

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

// ----- subcommands -----

async function cmdLogin(): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const baseUrl = (await rl.question(`Base URL [${DEFAULT_BASE_URL}]: `)).trim() || DEFAULT_BASE_URL;
  const token = (await rl.question("Token (bn_...): ")).trim();
  rl.close();
  if (!token.startsWith("bn_")) {
    console.error("token should start with 'bn_'. Aborting.");
    process.exit(1);
  }
  writeConfig({ baseUrl, token });
  console.log(`saved to ${configPath()}`);
}

function cmdLogout(): void {
  const p = configPath();
  if (existsSync(p)) {
    rmSync(p);
    console.log(`removed ${p}`);
  } else {
    console.log("no config to remove");
  }
}

function cmdWhoami(): void {
  const cfg = readConfig();
  console.log(`baseUrl: ${cfg.baseUrl}`);
  console.log(`token:   ${cfg.token ? `${cfg.token.slice(0, 11)}…` : "(none)"}`);
  console.log(`config:  ${configPath()}`);
}

interface Project {
  id: string;
  key: string;
  name: string;
  color: string;
  icon: string;
}

interface Entity {
  id: string;
  projectId: string | null;
  kind: string;
  title: string | null;
  body: string;
  status: string;
  dueAt: string | null;
  priority: string;
  sequenceId: number | null;
  tags: string[];
}

interface RecurrenceRule {
  id: string;
  rrule: string;
  anchor: string;
  enabled: boolean;
  nextOccurrenceAt: string | null;
}

interface RecurrenceDetails {
  rule: RecurrenceRule;
  currentOccurrence: Entity | null;
}

interface SkipOccurrenceResult {
  skipped: Entity;
  next: Entity | null;
  rule: RecurrenceRule;
}

interface TasksRangeResult {
  scheduled: Entity[];
  overdue: Entity[];
  backlog: Entity[];
}

function displayTitle(e: { title: string | null; body: string }): string {
  if (e.title && e.title.trim()) return e.title;
  const first = e.body.split("\n").find((l) => l.trim())?.trim() ?? "";
  return first ? (first.length > 60 ? `${first.slice(0, 60)}…` : first) : "(untitled)";
}

async function cmdProjects(): Promise<void> {
  const projects = await callApi<Project[]>("GET", "/v1/projects");
  for (const p of projects) {
    console.log(`${p.key.padEnd(10)} ${p.name}`);
  }
}

async function cmdToday(): Promise<void> {
  const projects = await callApi<Project[]>("GET", "/v1/projects");
  const projectByKey = new Map(projects.map((p) => [p.id, p]));
  const today = new Date();
  const from = new Date(today);
  from.setHours(0, 0, 0, 0);
  const to = new Date(today);
  to.setHours(23, 59, 59, 999);
  const data = await callApi<TasksRangeResult>("POST", "/v1/tasks/range", {
    from: from.toISOString(),
    to: to.toISOString(),
    includeBacklog: false,
    includeDone: false
  });
  printSection("Overdue", data.overdue, projectByKey);
  printSection("Today", data.scheduled, projectByKey);
}

function printSection(title: string, tasks: Entity[], pm: Map<string, Project>): void {
  console.log(`\n## ${title} (${tasks.length})`);
  if (tasks.length === 0) {
    console.log("  —");
    return;
  }
  for (const t of tasks) {
    const p = t.projectId ? pm.get(t.projectId) : undefined;
    const id = p && t.sequenceId ? `${p.key}-${t.sequenceId}` : t.id.slice(0, 8);
    const due = t.dueAt ? `(due ${t.dueAt.slice(0, 10)}) ` : "";
    const prio = t.priority !== "none" ? `[${t.priority}] ` : "";
    console.log(`  [${t.status}] ${id.padEnd(10)} ${prio}${due}${displayTitle(t)}`);
  }
}

async function cmdTasks(args: Args): Promise<void> {
  const projects = await callApi<Project[]>("GET", "/v1/projects");
  const pm = new Map(projects.map((p) => [p.id, p]));
  const status = (args.flags.status as string | undefined) ?? null;
  const rows = await callApi<Entity[]>("POST", "/v1/recent", {
    kinds: ["task"],
    limit: 100
  });
  const filtered = status ? rows.filter((r) => r.status === status) : rows;
  for (const t of filtered) {
    const p = t.projectId ? pm.get(t.projectId) : undefined;
    const id = p && t.sequenceId ? `${p.key}-${t.sequenceId}` : t.id.slice(0, 8);
    const due = t.dueAt ? ` (due ${t.dueAt.slice(0, 10)})` : "";
    console.log(`[${t.status.padEnd(11)}] ${id.padEnd(10)} ${displayTitle(t)}${due}`);
  }
}

async function resolveProjectId(keyOrId?: string): Promise<string | undefined> {
  if (!keyOrId) {
    const env = process.env.BOTNOTE_PROJECT;
    if (env) return resolveProjectId(env);
    return undefined;
  }
  if (/^[0-9a-f-]{36}$/i.test(keyOrId)) return keyOrId;
  const projects = await callApi<Project[]>("GET", "/v1/projects");
  const hit = projects.find((p) => p.key.toUpperCase() === keyOrId.toUpperCase());
  if (!hit) throw new Error(`project not found: ${keyOrId}`);
  return hit.id;
}

async function resolveEntity(identifier: string): Promise<Entity> {
  if (/^[0-9a-f-]{36}$/i.test(identifier)) {
    return callApi<Entity>("GET", `/v1/entities/${identifier}`);
  }
  const match = /^([A-Z][A-Z0-9_]*)-(\d+)$/i.exec(identifier);
  if (!match) throw new Error(`task identifier must be a UUID or KEY-123; got ${identifier}`);
  const key = match[1]!.toUpperCase();
  const seq = Number(match[2]);
  return callApi<Entity>("GET", `/v1/projects/by-key/${key}/entities/by-seq/${seq}`);
}

function splitList(value: unknown): string[] | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function recurrenceBody(args: Args, dueAt: string | null): Record<string, unknown> | null {
  const repeat = args.flags.repeat as string | undefined;
  const rrule = args.flags.rrule as string | undefined;
  if (!repeat && !rrule) return null;
  if (!dueAt && !args.flags.dtstart) {
    throw new Error("recurring tasks require --due YYYY-MM-DD or --dtstart ISO");
  }
  const body: Record<string, unknown> = {};
  if (rrule) body.rrule = rrule;
  else body.preset = repeat;
  if (args.flags.interval) body.interval = Number(args.flags.interval);
  const weekdays = splitList(args.flags.on);
  if (weekdays) body.byWeekday = weekdays.map((d) => d.toUpperCase());
  const monthDays = splitList(args.flags["month-day"]);
  if (monthDays) body.byMonthDay = monthDays.map(Number);
  const months = splitList(args.flags.month);
  if (months) body.byMonth = months.map(Number);
  if (args.flags.until) body.until = new Date(`${args.flags.until as string}T23:59:59Z`).toISOString();
  if (args.flags.count) body.count = Number(args.flags.count);
  if (args.flags.dtstart) body.dtstart = args.flags.dtstart;
  if (args.flags.timezone) body.timezone = args.flags.timezone;
  if (args.flags.anchor) body.anchor = args.flags.anchor;
  return body;
}

async function cmdTask(args: Args): Promise<void> {
  const title = args.positional.join(" ").trim();
  if (!title) {
    console.error('usage: botnote task "<title>" [--project KEY] [--due YYYY-MM-DD] [--priority P]');
    process.exit(1);
  }
  const projectId = await resolveProjectId(args.flags.project as string | undefined);
  const dueAt = args.flags.due
    ? new Date(`${args.flags.due as string}T12:00:00Z`).toISOString()
    : null;
  const priority = (args.flags.priority as string | undefined) ?? "none";
  const entity = await callApi<Entity>("POST", "/v1/tasks", {
    projectId: projectId ?? null,
    title,
    actorKind: "human",
    dueAt,
    priority
  });
  const recurrence = recurrenceBody(args, dueAt);
  if (recurrence) {
    const rule = await callApi<RecurrenceRule>("POST", `/v1/tasks/${entity.id}/recurrence`, recurrence);
    console.log(`✓ wrote recurring task ${entity.id}`);
    console.log(`  recurrence ${rule.rrule} (${rule.anchor})`);
    return;
  }
  console.log(`✓ wrote task ${entity.id}`);
}

async function cmdRecurrence(args: Args): Promise<void> {
  const identifier = args.positional[0];
  if (!identifier) {
    console.error("usage: botnote recurrence TASK");
    process.exit(1);
  }
  const task = await resolveEntity(identifier);
  const details = await callApi<RecurrenceDetails>("GET", `/v1/tasks/${task.id}/recurrence`);
  console.log(`rule:    ${details.rule.id}`);
  console.log(`enabled: ${details.rule.enabled}`);
  console.log(`rrule:   ${details.rule.rrule}`);
  console.log(`anchor:  ${details.rule.anchor}`);
  console.log(`next:    ${details.rule.nextOccurrenceAt ?? "-"}`);
}

async function cmdSkip(args: Args): Promise<void> {
  const identifier = args.positional[0];
  if (!identifier) {
    console.error('usage: botnote skip TASK [--reason "..."]');
    process.exit(1);
  }
  const task = await resolveEntity(identifier);
  const result = await callApi<SkipOccurrenceResult>(
    "POST",
    `/v1/tasks/${task.id}/skip-occurrence`,
    { reason: args.flags.reason as string | undefined, actorKind: "human" }
  );
  console.log(`✓ skipped ${result.skipped.id}`);
  console.log(`next: ${result.next ? result.next.id : "-"}`);
}

async function cmdStopRecurrence(args: Args): Promise<void> {
  const identifier = args.positional[0];
  if (!identifier) {
    console.error("usage: botnote stop-recurrence TASK");
    process.exit(1);
  }
  const task = await resolveEntity(identifier);
  const details = await callApi<RecurrenceDetails>("GET", `/v1/tasks/${task.id}/recurrence`);
  const rule = await callApi<RecurrenceRule>("POST", `/v1/recurrences/${details.rule.id}/stop`, {
    reason: args.flags.reason as string | undefined
  });
  console.log(`✓ stopped recurrence ${rule.id}`);
}

async function cmdNote(args: Args): Promise<void> {
  const body = args.positional.join(" ").trim();
  if (!body) {
    console.error('usage: botnote note "<body>" [--project KEY] [--pin]');
    process.exit(1);
  }
  const projectId = await resolveProjectId(args.flags.project as string | undefined);
  const entity = await callApi<Entity>("POST", "/v1/notes", {
    projectId: projectId ?? null,
    body,
    actorKind: "human",
    pinned: Boolean(args.flags.pin)
  });
  console.log(`✓ wrote note ${entity.id}`);
}

interface SearchHit {
  entity: Entity;
  score: number;
}
interface SearchResponse {
  hits: SearchHit[];
  embeddingUsed: boolean;
}

async function cmdSearch(args: Args): Promise<void> {
  const query = args.positional.join(" ").trim();
  if (!query) {
    console.error('usage: botnote search "<query>" [--limit N]');
    process.exit(1);
  }
  const limit = Number(args.flags.limit ?? 10);
  const data = await callApi<SearchResponse>("POST", "/v1/search", { query, limit });
  console.log(`${data.hits.length} hit(s) · embedding=${data.embeddingUsed ? "on" : "off"}\n`);
  for (const h of data.hits) {
    console.log(
      `[${h.score.toFixed(3)}] ${h.entity.kind.padEnd(7)} ${displayTitle(h.entity)}`
    );
    if (h.entity.body) {
      console.log(`        ${h.entity.body.slice(0, 100).replace(/\n/g, " ")}`);
    }
  }
}

function cmdServe(): void {
  // Re-exec into the existing daemon entry. dist/cli.js is sibling of dist/bin.js.
  const cli = path.resolve(path.dirname(new URL(import.meta.url).pathname), "cli.js");
  execFileSync(process.execPath, [cli], { stdio: "inherit" });
}

function cmdMcp(): void {
  const cli = path.resolve(path.dirname(new URL(import.meta.url).pathname), "cli.js");
  execFileSync(process.execPath, [cli, "mcp"], { stdio: "inherit" });
}

async function main(): Promise<void> {
  const [, , subcommand, ...rest] = process.argv;
  const args = parseArgs(rest);

  switch (subcommand) {
    case undefined:
    case "help":
    case "-h":
    case "--help":
      process.stdout.write(usage());
      return;
    case "version":
    case "-v":
    case "--version":
      console.log(VERSION);
      return;
    case "login":
      return cmdLogin();
    case "logout":
      return cmdLogout();
    case "whoami":
      return cmdWhoami();
    case "serve":
      return cmdServe();
    case "mcp":
      return cmdMcp();
    case "projects":
      return cmdProjects();
    case "today":
      return cmdToday();
    case "tasks":
      return cmdTasks(args);
    case "task":
      return cmdTask(args);
    case "recurrence":
      return cmdRecurrence(args);
    case "skip":
      return cmdSkip(args);
    case "stop-recurrence":
      return cmdStopRecurrence(args);
    case "note":
      return cmdNote(args);
    case "search":
      return cmdSearch(args);
    default:
      console.error(`unknown subcommand: ${subcommand}\n`);
      process.stdout.write(usage());
      process.exit(2);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
