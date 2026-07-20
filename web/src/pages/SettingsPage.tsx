import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  BrainCircuit,
  Check,
  ChevronRight,
  Cog,
  Command,
  Copy,
  ExternalLink,
  Info,
  KeyRound,
  LogOut,
  Package,
  Plug,
  Plus,
  Puzzle,
  RefreshCw,
  Terminal,
  Trash2,
  UserRound,
  Zap
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import {
  useBackfillEmbeddings,
  useCreateToken,
  useEmbeddingSettings,
  useHealth,
  useRevokeToken,
  useTokens,
  useUpdateEmbeddingSettings,
  useUpdateWorkspaceSettings,
  useWorkspaceSettings
} from "../api/hooks";
import type { CreatedToken, EmbeddingProvider, EmbeddingStatusReason } from "../api/types";

const BOTNOTE_HOST =
  typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:4280";
const MAX_EMBEDDING_BACKFILL = 100000;

type TabId = "account" | "tokens" | "cli" | "plugin" | "embedding" | "mcp" | "about";

interface TabDef {
  id: TabId;
  label: string;
  icon: typeof Cog;
}

const TABS: TabDef[] = [
  { id: "account", label: "Account", icon: UserRound },
  { id: "tokens", label: "API tokens", icon: KeyRound },
  { id: "cli", label: "CLI", icon: Terminal },
  { id: "plugin", label: "Plugin", icon: Puzzle },
  { id: "embedding", label: "Embeddings", icon: BrainCircuit },
  { id: "mcp", label: "MCP", icon: Plug },
  { id: "about", label: "About", icon: Info }
];

export function SettingsPage() {
  const [tab, setTab] = useState<TabId>("account");

  return (
    <div className="h-full flex bg-bg overflow-hidden">
      <nav className="w-52 shrink-0 border-r border-line bg-sidebar/60 overflow-y-auto scrollbar-thin">
        <div className="px-4 pt-4 pb-2 flex items-center gap-2">
          <Cog size={14} className="text-accent" />
          <span className="text-sm font-semibold">Settings</span>
        </div>
        <ul className="px-2 pb-4 space-y-0.5">
          {TABS.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => setTab(t.id)}
                className={`w-full text-left px-2.5 py-1.5 text-sm rounded-md flex items-center gap-2.5 transition-colors ${
                  tab === t.id
                    ? "bg-accentSoft/70 text-accentText font-medium"
                    : "text-muted hover:bg-sidebarHover hover:text-ink"
                }`}
              >
                <t.icon
                  size={13}
                  className={tab === t.id ? "text-accent" : "text-faint"}
                />
                {t.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <main className="flex-1 min-w-0 overflow-y-auto scrollbar-thin">
        <div className="mx-auto max-w-3xl px-8 py-8 space-y-6">
          {tab === "account" && <AccountSection />}
          {tab === "tokens" && <TokensSection />}
          {tab === "cli" && <CliSection />}
          {tab === "plugin" && <PluginSection />}
          {tab === "embedding" && <EmbeddingSection />}
          {tab === "mcp" && <McpSection />}
          {tab === "about" && <AboutSection />}
        </div>
      </main>
    </div>
  );
}

// ----------------------------------------------------------------------------

function SectionHeader({ title, blurb }: { title: string; blurb?: string }) {
  return (
    <header className="pb-4 border-b border-lineSoft space-y-1.5">
      <h1 className="text-lg font-semibold text-ink">{title}</h1>
      {blurb && <p className="text-xs text-muted leading-relaxed max-w-xl">{blurb}</p>}
    </header>
  );
}

function SubHeader({ title, blurb }: { title: string; blurb?: string }) {
  return (
    <div className="pt-2">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      {blurb && <p className="text-xs text-muted leading-relaxed mt-0.5">{blurb}</p>}
    </div>
  );
}

// ----------------------------------------------------------------------------

function AccountSection() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  async function onLogout() {
    if (busy) return;
    setBusy(true);
    try {
      await api.logout();
    } catch {
      // Even if the server call fails, fall through to the login page —
      // clearing the cookie locally is the user-visible part.
    }
    navigate("/login", { replace: true });
  }

  return (
    <>
      <SectionHeader
        title="Account"
        blurb="Browser session uses a master-password login. Agents (CLI / MCP) authenticate with bearer tokens, generated under API tokens."
      />
      <WorkspaceTimezoneCard />
      <div className="border border-line rounded-md bg-surface px-4 py-3 flex items-center justify-between">
        <div className="text-xs text-muted">
          Sign out of this browser. Other devices and any active bearer tokens
          are unaffected.
        </div>
        <button
          onClick={onLogout}
          disabled={busy}
          className="btn !text-red-500 !border-red-500/30 hover:!bg-red-500/10 gap-1.5"
        >
          <LogOut size={12} /> Log out
        </button>
      </div>
    </>
  );
}

function WorkspaceTimezoneCard() {
  const { data } = useWorkspaceSettings();
  const update = useUpdateWorkspaceSettings();
  const [timezone, setTimezone] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  // Populate from IANA list, guard if unavailable (old browsers).
  const tzOptions: string[] = (() => {
    try {
      return (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
    } catch {
      return [];
    }
  })();

  useEffect(() => {
    if (data) setTimezone(data.timezone);
  }, [data]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    await update.mutateAsync({ timezone });
    setMessage("Workspace timezone saved.");
  }

  return (
    <div className="border border-line rounded-md bg-surface px-4 py-4 space-y-3">
      <div>
        <div className="text-sm font-semibold text-ink">Workspace timezone</div>
        <p className="text-xs text-muted mt-0.5 leading-relaxed">
          Used to compute all-day recurring task occurrence dates on the correct local calendar day.
        </p>
      </div>
      <form onSubmit={onSave} className="flex items-end gap-3">
        <label className="flex-1 space-y-1">
          <span className="block text-xxs uppercase tracking-wider text-muted">Timezone</span>
          {tzOptions.length > 0 ? (
            <select
              className="input"
              value={timezone}
              onChange={(e) => { setTimezone(e.target.value); setMessage(null); }}
            >
              {tzOptions.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          ) : (
            <input
              className="input font-mono"
              value={timezone}
              onChange={(e) => { setTimezone(e.target.value); setMessage(null); }}
              placeholder="UTC"
            />
          )}
        </label>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={update.isPending || !timezone}
        >
          <Check size={11} /> {update.isPending ? "Saving..." : "Save"}
        </button>
      </form>
      {message && (
        <div className="text-xs text-accentText bg-accentSoft/50 border border-accent/20 rounded-md px-3 py-2">
          {message}
        </div>
      )}
      {update.error && (
        <div className="text-xs text-danger">
          {update.error instanceof Error ? update.error.message : String(update.error)}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------

function CliSection() {
  const installSteps: Step[] = [
    {
      note: "Global install on any machine with node + npm:",
      code: "npm i -g botnote"
    },
    {
      note: (
        <>
          One-time login. Default URL is <code className="text-ink">https://botnote.net</code> —
          paste a bearer token from Settings → API tokens. On the daemon host itself, override the
          URL to <code className="text-ink">http://127.0.0.1:4280</code> (no token needed, loopback
          is trusted).
        </>
      ),
      code: "botnote login"
    }
  ];

  const dailyCommands = [
    { code: "botnote today", desc: "today + overdue" },
    { code: "botnote tasks --status open", desc: "list open tasks" },
    {
      code: 'botnote task "Ship the CLI" --project BOT --priority high --due 2026-06-10',
      desc: "create a task"
    },
    { code: 'botnote note "Random capture" --project BOT --pin', desc: "capture a pinned note" },
    { code: 'botnote search "deployment"', desc: "hybrid search" },
    { code: "botnote projects", desc: "list project keys" }
  ];

  const overrideSteps: Step[] = [
    {
      note: (
        <>
          Per-shell override — skips{" "}
          <code className="text-ink">~/.config/botnote/config.json</code>:
        </>
      ),
      code: "BOTNOTE_URL=http://127.0.0.1:4280 botnote today"
    },
    {
      note: (
        <>
          Config file, preferred for the daemon host —{" "}
          <code className="text-ink">~/.config/botnote/config.json</code>:
        </>
      ),
      code: '{ "baseUrl": "http://127.0.0.1:4280" }'
    }
  ];

  return (
    <>
      <SectionHeader
        title="CLI"
        blurb="The botnote npm package ships a binary that talks to this daemon over HTTP. Same tool for quick capture, today review, and ad-hoc search from any terminal."
      />

      <StepsCard title="Install + login" steps={installSteps} />
      <CommandList title="Daily commands" items={dailyCommands} />
      <StepsCard title="Override the URL" steps={overrideSteps} />
    </>
  );
}

// ----------------------------------------------------------------------------

type PluginClientId = "skills" | "claude" | "codex" | "cursor" | "cli";

const REPO_MARKETPLACE_JSON = `{
  "name": "botnote-plugins",
  "interface": { "displayName": "botnote Plugins" },
  "plugins": [
    {
      "name": "botnote",
      "source": { "source": "local", "path": "./plugins/botnote" },
      "policy": { "installation": "AVAILABLE", "authentication": "ON_INSTALL" },
      "category": "Productivity"
    }
  ]
}`;

function PluginSection() {
  const [client, setClient] = useState<PluginClientId>("skills");

  const clients: {
    id: PluginClientId;
    label: string;
    icon: typeof Cog;
    subtitle: string;
    cards: { title: string; steps: Step[] }[];
  }[] = [
    {
      id: "skills",
      label: "Skills CLI",
      icon: Zap,
      subtitle:
        "Fastest path: one command installs the workflow skills into Claude Code, Codex, Cursor, and 70+ other agents. Wire the MCP server once per machine; hooks still require the Claude Code plugin.",
      cards: [
        {
          title: "Install",
          steps: [
            {
              note: "Install all botnote skills straight from the GitHub repo:",
              code: "npx skills add Jianhua-Wang/botnote"
            },
            {
              note: (
                <>
                  One-time MCP wiring — the skills call botnote MCP tools, which the skills CLI
                  does not set up. Use the command for your client:
                </>
              ),
              code:
                "# Claude Code\nclaude mcp add botnote \\\n  -e BOTNOTE_URL=https://botnote.net \\\n  -e BOTNOTE_TOKEN=<token> \\\n  -- npx -y botnote mcp\n\n# Codex\ncodex mcp add botnote \\\n  --env BOTNOTE_URL=https://botnote.net \\\n  --env BOTNOTE_TOKEN=<token> \\\n  -- npx -y botnote mcp"
            },
            {
              note: (
                <>
                  On the daemon host use <code className="text-ink">http://127.0.0.1:4280</code> and
                  skip the token. Want the bundled MCP prompts and the session-close feedback hook?
                  Use the Claude Code plugin tab instead.
                </>
              )
            }
          ]
        },
        {
          title: "Update",
          steps: [
            {
              note: "Refresh every installed skill from its source repo:",
              code: "npx skills update"
            },
            {
              note: "Inspect or prune what is installed:",
              code: "npx skills list\nnpx skills remove <name>"
            }
          ]
        }
      ]
    },
    {
      id: "claude",
      label: "Claude Code",
      icon: Command,
      subtitle:
        "Recommended for day-to-day work. Update through /plugin, then reload plugins in-session with /reload-plugins.",
      cards: [
        {
          title: "Install",
          steps: [
            {
              note: "In Claude Code, add the marketplace and install the plugin:",
              code: "/plugin marketplace add Jianhua-Wang/botnote\n/plugin install botnote@botnote"
            },
            {
              note: (
                <>
                  Claude Code prompts for <code className="text-ink">botnote_url</code> — default{" "}
                  <code className="text-ink">https://botnote.net</code>, use{" "}
                  <code className="text-ink">http://127.0.0.1:4280</code> on the daemon host — and{" "}
                  <code className="text-ink">botnote_token</code>, a bearer from Settings → API
                  tokens (skip on loopback).
                </>
              )
            }
          ]
        },
        {
          title: "Update",
          steps: [
            {
              note: (
                <>
                  Not every build exposes auto-update. Try the marketplace update first: open{" "}
                  <code className="text-ink">/plugin</code>, then Marketplaces → botnote → Update,
                  if your build shows it.
                </>
              ),
              code: "/plugin"
            },
            {
              note: "If there is no Update action, remove botnote in /plugin, then install it again:",
              code: "/plugin install botnote@botnote"
            },
            {
              note: "Apply changes in the current session:",
              code: "/reload-plugins"
            }
          ]
        }
      ]
    },
    {
      id: "codex",
      label: "Codex",
      icon: Terminal,
      subtitle:
        "Git marketplace flow with sparse checkout — no full botnote source checkout. Restart Codex after install or update.",
      cards: [
        {
          title: "Install",
          steps: [
            {
              note: "Add the Git marketplace. Sparse checkout keeps it light:",
              code: "codex plugin marketplace add https://github.com/Jianhua-Wang/botnote.git \\\n  --sparse .agents/plugins \\\n  --sparse plugins/botnote"
            },
            {
              note: "Install the plugin from it:",
              code: "codex plugin add botnote@botnote-plugins"
            },
            {
              note: (
                <>
                  Restart Codex — exit this session, then run{" "}
                  <code className="text-ink">codex</code> again. In the new session, check{" "}
                  <code className="text-ink">/mcp</code>.
                </>
              )
            }
          ]
        },
        {
          title: "Update",
          steps: [
            {
              note: "Refresh the Git marketplace snapshot, then reinstall from it:",
              code: "codex plugin marketplace upgrade botnote-plugins\ncodex plugin remove botnote@botnote-plugins\ncodex plugin add botnote@botnote-plugins"
            },
            { note: "Open a new Codex session after updating." }
          ]
        }
      ]
    },
    {
      id: "cursor",
      label: "Cursor",
      icon: Puzzle,
      subtitle:
        "Uses the same plugin bundle. Keep the CLI installed only if you want terminal commands or offline fallback.",
      cards: [
        {
          title: "Install",
          steps: [
            {
              note: (
                <>
                  Add the repository marketplace in Cursor's plugin UI — metadata lives at{" "}
                  <code className="text-ink">.cursor-plugin/marketplace.json</code>:
                </>
              ),
              code: "https://github.com/Jianhua-Wang/botnote"
            },
            {
              note: "Then install:",
              code: "botnote@botnote-plugins"
            }
          ]
        },
        {
          title: "Update",
          steps: [
            {
              note: "Refresh the marketplace in Cursor's plugin UI. If an explicit update action is unavailable, remove and install again from the same repository marketplace."
            },
            {
              note: "Keep the shared runtime current too:",
              code: "npm i -g botnote@latest"
            }
          ]
        }
      ]
    },
    {
      id: "cli",
      label: "CLI runtime",
      icon: Package,
      subtitle:
        "Optional helper for login, manual CLI commands, and offline fallback. Plugin MCP can run through npx without a global CLI.",
      cards: [
        {
          title: "Install runtime",
          steps: [
            {
              note: "Global install on any machine with node + npm:",
              code: "npm i -g botnote@latest"
            },
            {
              note: (
                <>
                  One-time login. Remote clients: save{" "}
                  <code className="text-ink">https://botnote.net</code> plus a bearer token from
                  Settings → API tokens. On the daemon host, use{" "}
                  <code className="text-ink">http://127.0.0.1:4280</code> and skip the token.
                </>
              ),
              code: "botnote login"
            }
          ]
        },
        {
          title: "Update runtime",
          steps: [
            {
              note: "If you installed the optional helper CLI, keep it current:",
              code: "npm i -g botnote@latest\nbotnote --version"
            }
          ]
        }
      ]
    }
  ];

  const slashCommands = [
    { code: "/botnote:today", desc: "today + overdue" },
    { code: "/botnote:show-todo", desc: "open work across projects" },
    { code: '/botnote:add-task "..."', desc: "create a task" },
    { code: "/botnote:start-work DEMO-12", desc: "pick up a task with project context" },
    { code: '/botnote:remember "..."', desc: "capture a note" },
    { code: '/botnote:recall "..."', desc: "hybrid search" },
    { code: "/botnote:done", desc: "mark current focus done" }
  ];

  const active = clients.find((c) => c.id === client) ?? clients[0]!;

  return (
    <>
      <SectionHeader
        title="Plugin"
        blurb="Add botnote as the plugin-backed MCP + workflow layer for each agent client. Letheia / Plane MCP setup should stay retired."
      />

      <ol className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <PluginStep
          n={1}
          title="Optional CLI"
          body="Install the npm binary when you want botnote login or terminal commands. Plugins can run without it via npx."
        />
        <PluginStep
          n={2}
          title="Skills or plugin"
          body="Quickest: npx skills add Jianhua-Wang/botnote for any client. Or install the marketplace plugin for bundled MCP wiring and hooks."
        />
        <PluginStep
          n={3}
          title="Reload client"
          body="Claude Code reloads plugins in-session. Codex needs a new session after install or update."
        />
      </ol>

      <div className="border border-accent/20 bg-accentSoft/50 rounded-md px-4 py-3 text-xs text-accentText leading-relaxed">
        Use <code className="text-ink">https://botnote.net</code> with an API token from this
        settings page on remote devices. On the daemon host, use{" "}
        <code className="text-ink">http://127.0.0.1:4280</code> and skip the token.
      </div>

      <section className="space-y-3">
        <div className="flex items-center border-b border-line">
          {clients.map((c) => (
            <button
              key={c.id}
              onClick={() => setClient(c.id)}
              className={`flex items-center gap-1.5 px-3 py-2 -mb-px text-xs font-medium border-b-2 transition-colors ${
                client === c.id
                  ? "border-accent text-ink"
                  : "border-transparent text-muted hover:text-ink"
              }`}
            >
              <c.icon size={12} className={client === c.id ? "text-accent" : ""} />
              {c.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted leading-relaxed">{active.subtitle}</p>
        {active.cards.map((c) => (
          <StepsCard key={`${active.id}-${c.title}`} title={c.title} steps={c.steps} />
        ))}
      </section>

      <SubHeader
        title="Slash commands"
        blurb="Available after Claude Code reloads plugins or Codex starts a new session with the plugin installed."
      />
      <CommandList title="Commands" items={slashCommands} />

      <details className="border border-line rounded-md bg-surface group open:pb-4">
        <summary className="px-4 py-3 text-sm text-ink cursor-pointer select-none flex items-center gap-2 list-none [&::-webkit-details-marker]:hidden">
          <ChevronRight
            size={13}
            className="text-faint transition-transform group-open:rotate-90"
          />
          <span className="font-medium">Advanced: repo-local marketplace entry</span>
          <span className="text-xxs text-faint ml-1">
            only when a repo vendors the plugin files
          </span>
        </summary>
        <div className="px-4 space-y-2">
          <p className="text-xs text-muted leading-relaxed">
            Marketplace entry for <code className="text-ink">.agents/plugins/marketplace.json</code>.
            Use this only when the repo already vendors{" "}
            <code className="text-ink">./plugins/botnote</code>.
          </p>
          <Snippet code={REPO_MARKETPLACE_JSON} />
        </div>
      </details>

      <div className="border border-line rounded-md bg-surface px-4 py-3 text-xs text-muted leading-relaxed flex items-start gap-3">
        <ExternalLink size={13} className="mt-0.5 shrink-0 text-accent" />
        <div>
          Plugin distribution lives at{" "}
          <a
            href="https://github.com/Jianhua-Wang/botnote"
            target="_blank"
            className="text-accent hover:underline"
            rel="noreferrer"
          >
            Jianhua-Wang/botnote
          </a>
          {". "}
          Claude Code updates through <code className="text-ink">/plugin</code>; after updating or
          reinstalling, run <code className="text-ink">/reload-plugins</code>. Codex has no reload
          command: refresh Git marketplace snapshots with{" "}
          <code className="text-ink">codex plugin marketplace upgrade</code>, reinstall the plugin,
          then start a new Codex session.
        </div>
      </div>
    </>
  );
}

function PluginStep({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <li className="border border-line rounded-md bg-surface px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="w-5 h-5 rounded-full bg-accentSoft text-accent text-xxs font-semibold flex items-center justify-center shrink-0">
          {n}
        </span>
        <span className="text-sm font-medium text-ink">{title}</span>
      </div>
      <p className="mt-1.5 text-xs text-muted leading-relaxed">{body}</p>
    </li>
  );
}

// ----------------------------------------------------------------------------

function EmbeddingSection() {
  const { data, isLoading } = useEmbeddingSettings();
  const update = useUpdateEmbeddingSettings();
  const backfill = useBackfillEmbeddings();
  const [enabled, setEnabled] = useState(true);
  const [provider, setProvider] = useState<EmbeddingProvider>("openai");
  const [model, setModel] = useState("text-embedding-3-small");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setEnabled(data.enabled);
    setProvider(data.provider);
    setModel(data.model);
    setBaseUrl(data.baseUrl ?? "");
    setApiKey("");
    setClearKey(false);
  }, [data]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const trimmedKey = apiKey.trim();
    const input = {
      enabled,
      provider,
      model: model.trim(),
      baseUrl: provider === "openai_compatible" ? baseUrl.trim() || null : null,
      ...(trimmedKey ? { apiKey: trimmedKey } : clearKey ? { apiKey: null } : {})
    };
    const next = await update.mutateAsync(input);
    setApiKey("");
    setClearKey(false);
    setMessage(next.effectiveEnabled ? "Embedding search is ready." : statusReasonText(next.statusReason));
  }

  async function onBackfill() {
    setMessage(null);
    const requested = Math.min(data?.missingCount ?? MAX_EMBEDDING_BACKFILL, MAX_EMBEDDING_BACKFILL);
    const result = await backfill.mutateAsync(requested);
    const capped = data && data.missingCount > MAX_EMBEDDING_BACKFILL;
    setMessage(
      capped
        ? `Queued ${result.enqueued} item(s), the maximum per request. Pending queue: ${result.pendingCount}.`
        : `Queued all ${result.enqueued} missing item(s). Pending queue: ${result.pendingCount}.`
    );
  }

  const embeddedPercent =
    data && data.totalCount > 0 ? Math.round((data.embeddedCount / data.totalCount) * 100) : 0;
  const canBackfill = Boolean(data?.effectiveEnabled && data.missingCount > 0);

  return (
    <>
      <SectionHeader
        title="Embeddings"
        blurb="Configure semantic search for botnote. The database vector column is fixed at 384 dimensions, so provider models must return 384-dimensional embeddings."
      />

      <div
        className={`border rounded-md px-4 py-3 text-xs leading-relaxed ${
          data?.effectiveEnabled
            ? "border-success/30 bg-success/10 text-ink"
            : "border-warn/30 bg-warn/10 text-ink"
        }`}
      >
        {isLoading ? (
          "Loading embedding settings..."
        ) : data?.effectiveEnabled ? (
          <>
            Semantic search is enabled via <strong>{providerLabel(data.provider)}</strong> using{" "}
            <code>{data.model}</code>. Search merges BM25 + cosine + time decay.
          </>
        ) : (
          <>
            Semantic search is not active: {statusReasonText(data?.statusReason ?? "not_loaded")}.
            Text search still works through BM25.
          </>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <MetricCard label="Status" value={data?.effectiveEnabled ? "On" : "Off"} />
        <MetricCard label="Embedded" value={`${data?.embeddedCount ?? 0}/${data?.totalCount ?? 0}`} />
        <MetricCard label="Missing" value={`${data?.missingCount ?? 0}`} />
        <MetricCard label="Queue" value={`${data?.pendingCount ?? 0}`} />
      </div>

      <div className="border border-line rounded-md bg-surface px-4 py-3 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-ink">Vector coverage</div>
            <div className="text-xxs text-muted">
              {embeddedPercent}% of task/note records have embeddings.
            </div>
          </div>
          <button
            type="button"
            className="btn"
            disabled={!canBackfill || backfill.isPending}
            onClick={onBackfill}
            title={
              data?.effectiveEnabled
                ? "Queue embeddings for all existing records without body_vec"
                : "Enable embeddings before backfilling"
            }
          >
            <RefreshCw size={11} /> {backfill.isPending ? "Queueing..." : "Backfill all missing"}
          </button>
        </div>
        <div className="h-2 rounded bg-sidebar overflow-hidden border border-lineSoft">
          <div
            className="h-full bg-accent"
            style={{ width: `${embeddedPercent}%` }}
          />
        </div>
      </div>

      <form onSubmit={onSave} className="border border-line rounded-md bg-surface px-4 py-4 space-y-4">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Enable semantic search
        </label>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="block text-xxs uppercase tracking-wider text-muted">Provider</span>
            <select
              className="input"
              value={provider}
              onChange={(e) => setProvider(e.target.value as EmbeddingProvider)}
            >
              <option value="openai">OpenAI</option>
              <option value="openai_compatible">OpenAI-compatible</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="block text-xxs uppercase tracking-wider text-muted">Model</span>
            <input
              className="input font-mono"
              list="embedding-models"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="text-embedding-3-small"
            />
            <datalist id="embedding-models">
              <option value="text-embedding-3-small" />
              <option value="text-embedding-3-large" />
            </datalist>
          </label>
        </div>

        {provider === "openai_compatible" && (
          <label className="space-y-1 block">
            <span className="block text-xxs uppercase tracking-wider text-muted">Base URL</span>
            <input
              className="input font-mono"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.example.com/v1"
            />
          </label>
        )}

        <label className="space-y-1 block">
          <span className="block text-xxs uppercase tracking-wider text-muted">API key</span>
          <input
            className="input font-mono"
            type="password"
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              if (e.target.value) setClearKey(false);
            }}
            placeholder={
              data?.apiKeyConfigured
                ? `Configured (${data.apiKeySource ?? "unknown"}${data.apiKeyPreview ? ` · ${data.apiKeyPreview}` : ""})`
                : "sk-..."
            }
          />
          <div className="flex items-center justify-between gap-3 text-xxs text-muted">
            <span>
              Full keys are stored server-side and are not returned to the browser after save.
            </span>
            {data?.settingsApiKeyConfigured && (
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={clearKey}
                  onChange={(e) => {
                    setClearKey(e.target.checked);
                    if (e.target.checked) setApiKey("");
                  }}
                />
                Clear stored key
              </label>
            )}
          </div>
        </label>

        <div className="border border-lineSoft rounded-md bg-sidebar/30 px-3 py-2 text-xs text-muted leading-relaxed">
          OpenAI-compatible providers must accept the OpenAI embeddings API and return{" "}
          <code className="text-ink">384</code> dimensions for the selected model. Existing
          vectors are not automatically regenerated when provider or model changes; use Backfill
          all missing to queue every record that does not have a vector yet.
        </div>

        {message && (
          <div className="text-xs text-accentText bg-accentSoft/50 border border-accent/20 rounded-md px-3 py-2">
            {message}
          </div>
        )}
        {update.error && (
          <div className="text-xs text-danger">
            {update.error instanceof Error ? update.error.message : String(update.error)}
          </div>
        )}
        {backfill.error && (
          <div className="text-xs text-danger">
            {backfill.error instanceof Error ? backfill.error.message : String(backfill.error)}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={update.isPending || model.trim().length === 0}
          >
            <Check size={11} /> {update.isPending ? "Saving..." : "Save embedding settings"}
          </button>
        </div>
      </form>
    </>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-line rounded-md bg-surface px-3 py-2">
      <div className="text-xxs uppercase tracking-wider text-muted">{label}</div>
      <div className="text-lg font-semibold text-ink mt-0.5">{value}</div>
    </div>
  );
}

function providerLabel(provider: EmbeddingProvider): string {
  return provider === "openai_compatible" ? "OpenAI-compatible" : "OpenAI";
}

function statusReasonText(reason: EmbeddingStatusReason): string {
  switch (reason) {
    case "ready":
      return "ready";
    case "disabled":
      return "disabled";
    case "missing_api_key":
      return "missing API key";
    case "missing_base_url":
      return "missing base URL";
    case "injected":
      return "using injected test embedder";
    case "not_loaded":
      return "configuration not loaded yet";
  }
}

// ----------------------------------------------------------------------------

function McpSection() {
  const claudeJson = `{
  "mcpServers": {
    "botnote": {
      "command": "botnote",
      "args": ["mcp"],
      "env": {
        "BOTNOTE_URL": "https://botnote.net",
        "BOTNOTE_TOKEN": "bn_..."
      }
    }
  }
}`;

  const codexToml = `[mcp_servers.botnote]
command = "botnote"
args = ["mcp"]

[mcp_servers.botnote.env]
BOTNOTE_URL = "https://botnote.net"
BOTNOTE_TOKEN = "bn_..."`;

  const codexSteps: Step[] = [
    {
      note: (
        <>
          Add to <code className="text-ink">~/.codex/config.toml</code>. On the daemon host, drop{" "}
          <code className="text-ink">BOTNOTE_TOKEN</code> and set{" "}
          <code className="text-ink">BOTNOTE_URL = "http://127.0.0.1:4280"</code> (loopback is
          trusted).
        </>
      ),
      code: codexToml
    }
  ];

  const curlSteps: Step[] = [
    {
      note: "Create a task:",
      code: `curl -X POST '${BOTNOTE_HOST}/v1/tasks' \\
  -H 'authorization: Bearer bn_...' \\
  -H 'content-type: application/json' \\
  -d '{
    "title": "Finish migration",
    "projectId": "<uuid>",
    "priority": "high"
  }'`
    },
    {
      note: "Create a note:",
      code: `curl -X POST '${BOTNOTE_HOST}/v1/notes' \\
  -H 'authorization: Bearer bn_...' \\
  -H 'content-type: application/json' \\
  -d '{ "body": "Quick capture", "pinned": false }'`
    },
    {
      note: "Hybrid search:",
      code: `curl -X POST '${BOTNOTE_HOST}/v1/search' \\
  -H 'authorization: Bearer bn_...' \\
  -H 'content-type: application/json' \\
  -d '{ "query": "deployment", "limit": 10 }'`
    }
  ];

  return (
    <>
      <SectionHeader
        title="MCP (raw integration)"
        blurb="Skip the Claude Code plugin and wire the MCP server in by hand — for Codex, custom agents, or any MCP-aware client. The botnote binary doubles as the MCP stdio server."
      />

      <CodeBlock title="Claude Code (~/.claude.json or project-local .mcp.json)" code={claudeJson} />
      <StepsCard title="Codex (~/.codex/config.toml)" steps={codexSteps} />
      <StepsCard title="REST · curl" steps={curlSteps} />

      <div className="border border-line rounded-md bg-surface px-4 py-3 text-xs text-muted leading-relaxed">
        Raw MCP configuration requires the <code className="text-ink">botnote</code> binary in
        <code className="text-ink"> PATH</code>{" "}
        (<code className="text-ink">npm i -g botnote</code>). The Claude Code and Codex plugins do not
        require a global CLI install; they run the matching npm package version automatically. The
        MCP server has no DB connection of its own; it speaks HTTP to whichever{" "}
        <code className="text-ink">BOTNOTE_URL</code> you set.
      </div>
    </>
  );
}

// ----------------------------------------------------------------------------

function AboutSection() {
  const { data: health, isLoading } = useHealth();
  const versionLabel = health?.version ? `v${health.version}` : isLoading ? "loading..." : "unknown";

  return (
    <>
      <SectionHeader title="About" blurb="Build + runtime info for this daemon." />
      <div className="border border-line rounded-md bg-surface px-4 py-3 text-xs text-muted space-y-2">
        <div>
          <span className="text-ink">botnote {versionLabel}</span> — Postgres 16 + pgvector + Fastify 5 +
          MCP SDK
        </div>
        <div>
          REST: <code className="text-ink">{BOTNOTE_HOST}</code> · docs:{" "}
          <a className="text-accent hover:underline" href="/docs" target="_blank" rel="noreferrer">
            /docs
          </a>
        </div>
        <div className="pt-1 border-t border-lineSoft">
          Auth is enforced when <code className="text-ink">BOTNOTE_REQUIRE_AUTH=1</code> on the
          daemon. Direct connections from loopback or private networks are trusted; requests via
          Cloudflare Tunnel (or any proxy that sets <code>cf-connecting-ip</code> /{" "}
          <code>x-forwarded-for</code>) require a bearer token or a browser session cookie.
        </div>
      </div>
    </>
  );
}

// ----------------------------------------------------------------------------

interface Step {
  note?: React.ReactNode;
  code?: string;
}

/** Card of prose steps interleaved with pure-command snippets. Copy buttons
 *  live on the snippets only, so copying never picks up explanatory text. */
function StepsCard({ title, steps }: { title: string; steps: Step[] }) {
  return (
    <div className="border border-line rounded-md bg-surface overflow-hidden">
      <div className="px-3 py-1.5 border-b border-lineSoft bg-sidebar/40">
        <span className="text-xxs uppercase tracking-wider text-muted font-medium">{title}</span>
      </div>
      <div className="px-3 py-3 space-y-3">
        {steps.map((s, i) => (
          <div key={i} className="space-y-1.5">
            {s.note && <p className="text-xs text-muted leading-relaxed">{s.note}</p>}
            {s.code && <Snippet code={s.code} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function Snippet({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  }

  return (
    <div className="relative border border-lineSoft rounded-md bg-sidebar/30">
      <pre className="px-3 py-2 pr-9 text-xs font-mono leading-relaxed overflow-x-auto whitespace-pre text-ink2">
        {code}
      </pre>
      <button
        onClick={copy}
        className="absolute top-1.5 right-1.5 p-1 rounded text-faint hover:text-ink hover:bg-sidebarHover transition-colors"
        title="Copy command"
      >
        {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
      </button>
    </div>
  );
}

/** Cheat-sheet list: one command per row with its description as plain text
 *  and a per-row copy button that copies only the command. */
function CommandList({
  title,
  items
}: {
  title: string;
  items: { code: string; desc: string }[];
}) {
  return (
    <div className="border border-line rounded-md bg-surface overflow-hidden">
      <div className="px-3 py-1.5 border-b border-lineSoft bg-sidebar/40">
        <span className="text-xxs uppercase tracking-wider text-muted font-medium">{title}</span>
      </div>
      <ul className="divide-y divide-lineSoft">
        {items.map((it) => (
          <CommandRow key={it.code} code={it.code} desc={it.desc} />
        ))}
      </ul>
    </div>
  );
}

function CommandRow({ code, desc }: { code: string; desc: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  }

  return (
    <li className="group flex items-center gap-3 px-3 py-1.5">
      <code className="font-mono text-xs text-ink whitespace-nowrap overflow-x-auto scrollbar-thin">
        {code}
      </code>
      <span className="flex-1 text-xs text-muted text-right truncate">{desc}</span>
      <button
        onClick={copy}
        className={`p-1 rounded transition-colors ${
          copied
            ? "text-success"
            : "text-faint hover:text-ink opacity-0 group-hover:opacity-100 focus:opacity-100"
        }`}
        title="Copy command"
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
      </button>
    </li>
  );
}

function CodeBlock({ title, code }: { title: string; code: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  }

  return (
    <div className="border border-line rounded-md bg-surface overflow-hidden">
      <div className="px-3 py-1.5 border-b border-lineSoft flex items-center justify-between bg-sidebar/40">
        <span className="text-xxs uppercase tracking-wider text-muted font-medium">{title}</span>
        <button
          onClick={copy}
          className="text-xxs text-muted hover:text-ink flex items-center gap-1"
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="px-3 py-2 text-xs font-mono leading-relaxed overflow-x-auto whitespace-pre bg-sidebar/20 text-ink2">
        {code}
      </pre>
    </div>
  );
}

// ----------------------------------------------------------------------------

function TokensSection() {
  const { data: tokens, isLoading } = useTokens();
  const create = useCreateToken();
  const revoke = useRevokeToken();
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<CreatedToken | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Single state for "which row just flashed Copied" — only one feedback at
  // a time, auto-clears after a brief moment.
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function copyToken(t: { id: string; plaintext: string }) {
    navigator.clipboard.writeText(t.plaintext).then(() => {
      setCopiedId(t.id);
      setTimeout(() => setCopiedId((cur) => (cur === t.id ? null : cur)), 1400);
    });
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const t = await create.mutateAsync(name.trim());
    setFresh(t);
    setName("");
  }

  async function onRevoke(id: string, tokenName: string) {
    if (deletingId) return;
    if (!confirm(`Revoke token "${tokenName}"? Any client using it stops working.`)) return;
    setDeletingId(id);
    setDeleteError(null);
    try {
      await revoke.mutateAsync(id);
      if (fresh?.id === id) setFresh(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setDeleteError(`Could not revoke "${tokenName}": ${msg}`);
    } finally {
      setDeletingId((cur) => (cur === id ? null : cur));
    }
  }

  return (
    <>
      <SectionHeader
        title="API tokens"
        blurb="Bearer tokens for the CLI, MCP server, and direct REST calls. New tokens keep their full value available for copying here; older tokens created before this change only have a prefix and must be regenerated if the full value was lost."
      />

      {fresh && (
        <div className="border border-warn rounded-md bg-warn/10 p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-warn">
            <AlertTriangle size={13} />
            Copy this token now, or later from the token list.
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono bg-surface border border-line rounded px-2 py-1 overflow-x-auto whitespace-nowrap">
              {fresh.plaintext}
            </code>
            <button
              className="btn"
              onClick={() => navigator.clipboard.writeText(fresh.plaintext)}
            >
              <Copy size={11} /> Copy
            </button>
            <button className="btn" onClick={() => setFresh(null)}>
              Done
            </button>
          </div>
        </div>
      )}

      {deleteError && (
        <div className="border border-danger/30 rounded-md bg-danger/10 px-3 py-2 text-xs text-danger">
          {deleteError}
        </div>
      )}

      <form onSubmit={onCreate} className="flex gap-2">
        <input
          className="input flex-1"
          placeholder="Token name (e.g. claude-code-laptop)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          type="submit"
          className="btn btn-primary"
          disabled={!name.trim() || create.isPending}
        >
          <Plus size={11} /> {create.isPending ? "Generating…" : "Generate"}
        </button>
      </form>

      <div className="border border-line rounded-md bg-surface divide-y divide-lineSoft overflow-hidden">
        {isLoading && <div className="p-3 text-xs text-muted">Loading…</div>}
        {!isLoading && (!tokens || tokens.length === 0) && (
          <div className="p-4 text-xs text-faint text-center">No tokens yet.</div>
        )}
        {tokens?.map((t) => {
          const justCopied = copiedId === t.id;
          return (
            <div key={t.id} className="flex items-center gap-3 px-3 py-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm text-ink truncate">{t.name}</div>
                <div className="text-xxs text-muted flex items-center gap-3 mt-0.5">
                  <code className="font-mono text-faint">{t.prefix}…</code>
                  <span>
                    created {formatDistanceToNow(new Date(t.createdAt), { addSuffix: true })}
                  </span>
                  <span>
                    {t.lastUsedAt
                      ? `used ${formatDistanceToNow(new Date(t.lastUsedAt), { addSuffix: true })}`
                      : "never used"}
                  </span>
                </div>
              </div>
              {t.plaintext ? (
                <button
                  type="button"
                  onClick={() => copyToken({ id: t.id, plaintext: t.plaintext! })}
                  className={`btn gap-1.5 ${
                    justCopied ? "!border-emerald-500/30 !text-emerald-600" : ""
                  }`}
                  title="Copy full token"
                >
                  {justCopied ? <Check size={11} /> : <Copy size={11} />}
                  {justCopied ? "Copied" : "Copy token"}
                </button>
              ) : (
                <span
                  className="text-xxs text-faint border border-line rounded px-2 py-1"
                  title="Full token is unavailable for tokens created before recoverable storage was enabled."
                >
                  Unavailable
                </span>
              )}
              <button
                type="button"
                className="text-faint hover:text-danger p-1 -m-1"
                disabled={deletingId !== null}
                onClick={() => onRevoke(t.id, t.name)}
                title={deletingId === t.id ? "Revoking" : "Revoke"}
              >
                {deletingId === t.id ? (
                  <span className="text-xxs text-muted">Revoking…</span>
                ) : (
                  <Trash2 size={12} />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
