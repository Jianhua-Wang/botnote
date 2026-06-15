import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  Check,
  Cog,
  Copy,
  Info,
  KeyRound,
  LogOut,
  Plug,
  Plus,
  Puzzle,
  Terminal,
  Trash2
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useCreateToken, useHealth, useRevokeToken, useTokens } from "../api/hooks";
import type { CreatedToken } from "../api/types";

const BOTNOTE_HOST =
  typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:4280";

type TabId = "account" | "tokens" | "cli" | "plugin" | "mcp" | "about";

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
        <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
          {tab === "account" && <AccountSection />}
          {tab === "tokens" && <TokensSection />}
          {tab === "cli" && <CliSection />}
          {tab === "plugin" && <PluginSection />}
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
  const cliInstallBlock = `# Runtime used by Claude Code, Codex, and Cursor plugins.
npm i -g botnote

# Remote clients should save https://botnote.net + a bearer token.
# On the daemon host, use http://127.0.0.1:4280 and skip the token.
botnote login`;

  const claudeInstallBlock = `# In Claude Code
/plugin marketplace add jianhuawang/botnote
/plugin install botnote@botnote

# Claude Code will prompt for:
#   botnote_url    -> default https://botnote.net (or http://127.0.0.1:4280 on daemon host)
#   botnote_token  -> bearer from Settings → API tokens (skip on loopback)`;

  const codexMarketplaceBlock = `// Add this to .agents/plugins/marketplace.json in your repo.
// Then install botnote@botnote-plugins from Codex Settings → Plugin.
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

  const codexGitBlock = `# No full source checkout required.
codex plugin marketplace add https://github.com/jianhuawang/botnote.git \\
  --sparse .codex-plugin \\
  --sparse plugins/botnote

codex plugin add botnote@botnote-plugins`;

  const cursorMarketplaceBlock = `# Cursor plugin clients can use the repository marketplace.
# Marketplace metadata lives at .cursor-plugin/marketplace.json.
https://github.com/jianhuawang/botnote`;

  const codexSettingsBlock = `# ~/.codex/config.toml
[plugins."botnote@botnote-plugins"]
enabled = true

[marketplaces.botnote-plugins]
source_type = "local"
source = "/absolute/path/to/botnote"`;

  const useBlock = `/botnote:today              # today + overdue
/botnote:show-todo          # open work across projects
/botnote:add-task "..."     # create a task
/botnote:start-work DEMO    # pick up project work
/botnote:remember "..."     # capture a note
/botnote:recall "..."       # hybrid search
/botnote:done               # mark current focus done`;

  return (
    <>
      <SectionHeader
        title="Plugin"
        blurb="The botnote plugin bundles slash commands and a curator subagent for Claude Code, Codex, and Cursor. The plugin calls the npm CLI for MCP, so no separate task or memory MCP setup is required."
      />

      <CodeBlock title="Install CLI runtime" code={cliInstallBlock} />
      <CodeBlock title="Claude Code install" code={claudeInstallBlock} />
      <CodeBlock title="Codex marketplace entry" code={codexMarketplaceBlock} />
      <CodeBlock title="Codex Git marketplace" code={codexGitBlock} />
      <CodeBlock title="Codex settings" code={codexSettingsBlock} />
      <CodeBlock title="Cursor marketplace" code={cursorMarketplaceBlock} />
      <CodeBlock title="Slash commands" code={useBlock} />

      <div className="border border-line rounded-md bg-surface px-4 py-3 text-xs text-muted leading-relaxed">
        Plugin distribution lives at{" "}
        <a
          href="https://github.com/jianhuawang/botnote"
          target="_blank"
          className="text-accent hover:underline"
          rel="noreferrer"
        >
          jianhuawang/botnote
        </a>
        {". "}
        The MCP server inside the plugin uses the URL + token from the install prompt.
        On the daemon host, <code className="text-ink">http://127.0.0.1:4280</code> can run
        without a token; remote clients should use a bearer token from API tokens.
      </div>
    </>
  );
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
        Requires the <code className="text-ink">botnote</code> binary in
        <code className="text-ink"> PATH</code>{" "}
        (<code className="text-ink">npm i -g botnote</code>). The MCP server has no DB connection of
        its own; it speaks HTTP to whichever <code className="text-ink">BOTNOTE_URL</code> you set.
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
