import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  BrainCircuit,
  Check,
  Cog,
  Command,
  Copy,
  Download,
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
  Trash2
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
  useUpdateEmbeddingSettings
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
  { id: "account", label: "Account", icon: KeyRound },
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
        <div className="px-4 py-4 flex items-center gap-2 border-b border-lineSoft">
          <Cog size={14} className="text-accent" />
          <span className="text-sm font-semibold">Settings</span>
        </div>
        <ul className="py-2">
          {TABS.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => setTab(t.id)}
                className={`w-full text-left px-4 py-1.5 text-sm flex items-center gap-2 transition-colors ${
                  tab === t.id
                    ? "bg-accentSoft/60 text-accent font-medium"
                    : "text-muted hover:bg-sidebar hover:text-ink"
                }`}
              >
                <t.icon size={12} />
                {t.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <main className="flex-1 min-w-0 overflow-y-auto scrollbar-thin">
        <div
          className={`mx-auto px-6 py-6 space-y-6 ${
            tab === "plugin" ? "max-w-5xl" : "max-w-3xl"
          }`}
        >
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
    <header className="space-y-1.5">
      <h1 className="text-lg font-semibold text-ink">{title}</h1>
      {blurb && <p className="text-xs text-muted leading-relaxed">{blurb}</p>}
    </header>
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

// ----------------------------------------------------------------------------

function CliSection() {
  const installBlock = `# Global install (any machine with node + npm).
npm i -g botnote

# One-time login. Default URL is https://botnote.net — paste a bearer token
# from Settings → API tokens. On the daemon host itself, override the URL
# to http://127.0.0.1:4280 (no token needed, loopback is trusted).
botnote login`;

  const useBlock = `botnote today                          # today + overdue
botnote tasks --status open            # list open tasks
botnote task "Ship the CLI" --project BOT --priority high --due 2026-06-10
botnote note "Random capture" --project BOT --pin
botnote search "deployment"
botnote projects                       # list project keys`;

  const envBlock = `# Per-shell override (skips ~/.config/botnote/config.json)
BOTNOTE_URL=http://127.0.0.1:4280 botnote today

# Config file (preferred for the daemon host):
#   ~/.config/botnote/config.json
#   { "baseUrl": "http://127.0.0.1:4280" }`;

  return (
    <>
      <SectionHeader
        title="CLI"
        blurb="The botnote npm package ships a binary that talks to this daemon over HTTP. Same tool for quick capture, today review, and ad-hoc search from any terminal."
      />

      <CodeBlock title="Install + login" code={installBlock} />
      <CodeBlock title="Daily commands" code={useBlock} />
      <CodeBlock title="Override the URL" code={envBlock} />
    </>
  );
}

// ----------------------------------------------------------------------------

function PluginSection() {
  const cliInstallBlock = `# Optional helper CLI for login and manual commands.
# Plugins can run without a global CLI by using npx.
npm i -g botnote@latest

# Remote clients: save https://botnote.net + a bearer token.
# Daemon host: use http://127.0.0.1:4280 and skip the token.
botnote login`;

  const cliUpdateBlock = `# If you installed the optional helper CLI, keep it current.
npm i -g botnote@latest
botnote --version`;

  const claudeInstallBlock = `# In Claude Code
/plugin marketplace add jianhua-wang/botnote
/plugin install botnote@botnote

# Claude Code will prompt for:
#   botnote_url    -> default https://botnote.net (use http://127.0.0.1:4280 on daemon host)
#   botnote_token  -> bearer from Settings → API tokens (skip on loopback)`;

  const claudeUpdateBlock = `# Preferred: enable marketplace auto-update in Claude Code.
/plugin
# Marketplaces → botnote → Enable auto-update

# After Claude reports an updated plugin:
/reload-plugins

# Manual update, if available in your Claude Code build:
claude plugin update botnote@botnote`;

  const codexInstallBlock = `# No full source checkout required.
codex plugin marketplace add https://github.com/jianhua-wang/botnote.git \\
  --sparse .agents/plugins \\
  --sparse plugins/botnote

codex plugin add botnote@botnote-plugins

# Restart Codex: exit this session, then run codex again.
# In the new session, check /mcp.`;

  const codexUpdateBlock = `# Codex refreshes Git marketplaces, then installs from the fresh snapshot.
codex plugin marketplace upgrade botnote-plugins
codex plugin remove botnote@botnote-plugins
codex plugin add botnote@botnote-plugins

# Open a new Codex session after updating.`;

  const repoMarketplaceBlock = `// Advanced: repo-local marketplace entry for .agents/plugins/marketplace.json.
// Use this only when the repo already vendors ./plugins/botnote.
{
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

  const cursorInstallBlock = `# Cursor plugin clients can use the repository marketplace.
# Marketplace metadata lives at .cursor-plugin/marketplace.json.
https://github.com/jianhua-wang/botnote

# Then install:
botnote@botnote-plugins`;

  const cursorUpdateBlock = `# Refresh the marketplace in Cursor's plugin UI.
# If an explicit update action is unavailable, remove and install again
# from the same repository marketplace.

# Keep the shared runtime current too:
npm i -g botnote@latest`;

  const useBlock = `/botnote:today              # today + overdue
/botnote:show-todo          # open work across projects
/botnote:add-task "..."     # create a task
/botnote:start-work DEMO-12 # pick up a task with project context
/botnote:remember "..."     # capture a note
/botnote:recall "..."       # hybrid search
/botnote:done               # mark current focus done`;

  return (
    <>
      <SectionHeader
        title="Plugin"
        blurb="Add botnote as the plugin-backed MCP + workflow layer for each agent client. Letheia / Plane MCP setup should stay retired."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <PluginStep
          icon={Package}
          title="1. Optional CLI"
          body="Install the npm binary when you want botnote login or terminal commands. Plugins can run without it via npx."
        />
        <PluginStep
          icon={Download}
          title="2. Client plugin"
          body="Install the marketplace plugin in Claude Code, Codex, Cursor, or another agent client."
        />
        <PluginStep
          icon={RefreshCw}
          title="3. Reload client"
          body="Claude Code reloads plugins in-session. Codex needs a new session after install or update."
        />
      </div>

      <div className="border border-accent/20 bg-accentSoft/50 rounded-md px-4 py-3 text-xs text-accentText leading-relaxed">
        Use <code className="text-ink">https://botnote.net</code> with an API token from this
        settings page on remote devices. On the daemon host, use{" "}
        <code className="text-ink">http://127.0.0.1:4280</code> and skip the token.
      </div>

      <PluginClientHeader
        icon={Package}
        title="Runtime"
        subtitle="Optional helper for login, manual CLI commands, and offline fallback. Plugin MCP can run through npx without a global CLI."
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <CodeBlock title="Install runtime" code={cliInstallBlock} />
        <CodeBlock title="Update runtime" code={cliUpdateBlock} />
      </div>

      <PluginClientHeader
        icon={Command}
        title="Claude Code"
        subtitle="Recommended for day-to-day work. Enable marketplace auto-update after installation."
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <CodeBlock title="Install" code={claudeInstallBlock} />
        <CodeBlock title="Update" code={claudeUpdateBlock} />
      </div>

      <PluginClientHeader
        icon={Terminal}
        title="Codex"
        subtitle="Use the Git marketplace flow; sparse checkout means no full botnote source checkout. Restart Codex after install or update."
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <CodeBlock title="Install" code={codexInstallBlock} />
        <CodeBlock title="Update" code={codexUpdateBlock} />
      </div>

      <PluginClientHeader
        icon={Puzzle}
        title="Cursor"
        subtitle="Uses the same plugin bundle. Keep the CLI installed only if you want terminal commands or offline fallback."
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <CodeBlock title="Install" code={cursorInstallBlock} />
        <CodeBlock title="Update" code={cursorUpdateBlock} />
      </div>

      <PluginClientHeader
        icon={Cog}
        title="Advanced"
        subtitle="Only needed when a repo vendors the plugin files locally."
      />
      <CodeBlock title="Repo-local marketplace entry" code={repoMarketplaceBlock} />

      <PluginClientHeader
        icon={Plug}
        title="Slash commands"
        subtitle="Available after Claude Code reloads plugins or Codex starts a new session with the plugin installed."
      />
      <CodeBlock title="Commands" code={useBlock} />

      <div className="border border-line rounded-md bg-surface px-4 py-3 text-xs text-muted leading-relaxed flex items-start gap-3">
        <ExternalLink size={13} className="mt-0.5 shrink-0 text-accent" />
        <div>
          Plugin distribution lives at{" "}
          <a
            href="https://github.com/jianhua-wang/botnote"
            target="_blank"
            className="text-accent hover:underline"
            rel="noreferrer"
          >
            jianhua-wang/botnote
          </a>
          {". "}
          Claude Code can auto-update third-party marketplaces when enabled; after an update, run{" "}
          <code className="text-ink">/reload-plugins</code>. Codex has no reload command: refresh
          Git marketplace snapshots with{" "}
          <code className="text-ink">codex plugin marketplace upgrade</code>, reinstall the plugin,
          then start a new Codex session.
        </div>
      </div>
    </>
  );
}

function PluginStep({
  icon: Icon,
  title,
  body
}: {
  icon: typeof Cog;
  title: string;
  body: string;
}) {
  return (
    <div className="border border-line rounded-md bg-surface px-4 py-3 min-h-[104px]">
      <div className="flex items-center gap-2 text-sm font-semibold text-ink">
        <span className="w-6 h-6 rounded-md bg-accentSoft text-accent flex items-center justify-center shrink-0">
          <Icon size={13} />
        </span>
        {title}
      </div>
      <p className="mt-2 text-xs text-muted leading-relaxed">{body}</p>
    </div>
  );
}

function PluginClientHeader({
  icon: Icon,
  title,
  subtitle
}: {
  icon: typeof Cog;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="pt-2 border-t border-lineSoft flex items-start gap-2">
      <span className="mt-0.5 w-6 h-6 rounded-md bg-sidebar text-muted border border-line flex items-center justify-center shrink-0">
        <Icon size={13} />
      </span>
      <div>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        <p className="text-xs text-muted leading-relaxed mt-0.5">{subtitle}</p>
      </div>
    </div>
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

  const codexToml = `# ~/.codex/config.toml
[mcp_servers.botnote]
command = "botnote"
args = ["mcp"]

[mcp_servers.botnote.env]
BOTNOTE_URL = "https://botnote.net"
BOTNOTE_TOKEN = "bn_..."

# On the daemon host, drop BOTNOTE_TOKEN and set
# BOTNOTE_URL = "http://127.0.0.1:4280" (loopback is trusted).`;

  const curlExample = `# Create a task via REST
curl -X POST '${BOTNOTE_HOST}/v1/tasks' \\
  -H 'authorization: Bearer bn_...' \\
  -H 'content-type: application/json' \\
  -d '{
    "title": "Finish migration",
    "projectId": "<uuid>",
    "priority": "high"
  }'

# Create a note
curl -X POST '${BOTNOTE_HOST}/v1/notes' \\
  -H 'authorization: Bearer bn_...' \\
  -H 'content-type: application/json' \\
  -d '{ "body": "Quick capture", "pinned": false }'

# Hybrid search
curl -X POST '${BOTNOTE_HOST}/v1/search' \\
  -H 'authorization: Bearer bn_...' \\
  -H 'content-type: application/json' \\
  -d '{ "query": "deployment", "limit": 10 }'`;

  return (
    <>
      <SectionHeader
        title="MCP (raw integration)"
        blurb="Skip the Claude Code plugin and wire the MCP server in by hand — for Codex, custom agents, or any MCP-aware client. The botnote binary doubles as the MCP stdio server."
      />

      <CodeBlock title="Claude Code (~/.claude.json or project-local .mcp.json)" code={claudeJson} />
      <CodeBlock title="Codex (~/.codex/config.toml)" code={codexToml} />
      <CodeBlock title="REST · curl" code={curlExample} />

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
