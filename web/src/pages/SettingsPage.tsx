import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, Check, Cog, Copy, KeyRound, LogOut, Plug, Plus, Terminal, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useCreateToken, useRevokeToken, useTokens } from "../api/hooks";
import type { CreatedToken } from "../api/types";

const BOTNOTE_HOST = typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:4280";
const BOTNOTE_BIN = "/Users/jianhua/botnote/dist/cli.js";
const BOTNOTE_MCP_BIN = "/Users/jianhua/botnote/dist/bin.js";

export function SettingsPage() {
  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-8">
        <header className="flex items-baseline gap-3">
          <Cog size={18} className="text-accent" />
          <h1 className="text-lg font-semibold">Settings</h1>
        </header>

        <AccountSection />
        <CliSection />
        <IntegrationSection />
        <TokensSection />

        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted font-semibold">
            About
          </h2>
          <div className="border border-line rounded-md bg-surface px-4 py-3 text-xs text-muted space-y-1">
            <div>botnote v0.0.1 — Postgres 16 + pgvector + Fastify 5 + MCP SDK</div>
            <div>
              REST: <code className="text-ink">{BOTNOTE_HOST}</code> · docs:{" "}
              <a className="text-accent hover:underline" href="/docs" target="_blank">
                /docs
              </a>
            </div>
            <div>
              Auth enforcement is controlled by the{" "}
              <code className="text-ink">BOTNOTE_REQUIRE_AUTH=1</code> env var on the daemon.
              When off, the API is open (assume tailnet-only). When on, every{" "}
              <code>/v1/*</code> call needs <code>Authorization: Bearer &lt;token&gt;</code>.
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

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
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted font-semibold">
        <KeyRound size={12} /> Account
      </h2>
      <div className="border border-line rounded-md bg-surface px-4 py-3 flex items-center justify-between">
        <div className="text-xs text-muted">
          Browser sign-in via master password. The CLI / MCP use bearer tokens
          (managed below).
        </div>
        <button
          onClick={onLogout}
          disabled={busy}
          className="btn !text-red-500 !border-red-500/30 hover:!bg-red-500/10 gap-1.5"
        >
          <LogOut size={12} /> Log out
        </button>
      </div>
    </section>
  );
}

function CliSection() {
  const cliInstall = `cd /Users/jianhua/botnote && npm link
# binary lands in your PATH as: botnote

botnote --help
botnote login                         # paste a token from below
botnote today                         # today + overdue
botnote task "Ship CLI" --project DOC --priority high
botnote note "Quick capture" --project DOC --pin
botnote search "deployment"`;

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted font-semibold">
        <Terminal size={11} />
        Command-line (botnote CLI)
      </h2>
      <p className="text-xs text-muted">
        The npm-linked <code>botnote</code> binary wraps the REST API. Quick-capture from any
        terminal — Claude Code, tmux pane, anywhere.
      </p>
      <CodeBlock title="Install + use" code={cliInstall} language="bash" />
    </section>
  );
}

function IntegrationSection() {
  const claudeJson = JSON.stringify(
    {
      mcpServers: {
        botnote: {
          command: "node",
          args: [BOTNOTE_BIN, "mcp"],
          env: { DATABASE_URL: "postgres://botnote:botnote@127.0.0.1:55434/botnote" }
        }
      }
    },
    null,
    2
  );

  const codexToml = `# ~/.codex/config.toml
[mcp_servers.botnote]
command = "node"
args = ["${BOTNOTE_MCP_BIN}", "mcp"]
env = { DATABASE_URL = "postgres://botnote:botnote@127.0.0.1:55434/botnote" }`;

  const curlExample = `# Write a task via REST
curl -X POST '${BOTNOTE_HOST}/v1/entities' \\
  -H 'content-type: application/json' \\
  -d '{
    "kind": "task",
    "projectId": "<uuid>",
    "title": "Finish migration",
    "priority": "high"
  }'`;

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted font-semibold">
        <Plug size={11} />
        Plugin integration
      </h2>
      <p className="text-xs text-muted">
        Wire botnote into Claude Code, Codex, or any MCP-aware client. The stdio MCP server boots
        from the same binary as the REST daemon.
      </p>

      <CodeBlock title="Claude Code (~/.claude.json)" code={claudeJson} language="json" />
      <CodeBlock title="Codex (~/.codex/config.toml)" code={codexToml} language="toml" />
      <CodeBlock title="REST · curl example" code={curlExample} language="bash" />
    </section>
  );
}

function CodeBlock({ title, code, language: _language }: { title: string; code: string; language: string }) {
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

function TokensSection() {
  const { data: tokens, isLoading } = useTokens();
  const create = useCreateToken();
  const revoke = useRevokeToken();
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<CreatedToken | null>(null);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const t = await create.mutateAsync(name.trim());
    setFresh(t);
    setName("");
  }

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted font-semibold">
        <KeyRound size={11} />
        API tokens
      </h2>
      <p className="text-xs text-muted">
        Tokens are stored as sha256 hashes — the plaintext is shown only once at creation. Use as{" "}
        <code>Authorization: Bearer &lt;token&gt;</code>.
      </p>

      {fresh && (
        <div className="border border-warn rounded-md bg-warn/10 p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-warn">
            <AlertTriangle size={13} />
            Copy this token now — it won't be shown again.
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
        {tokens?.map((t) => (
          <div key={t.id} className="flex items-center gap-3 px-3 py-2">
            <div className="flex-1 min-w-0">
              <div className="text-sm text-ink truncate">{t.name}</div>
              <div className="text-xxs text-muted flex items-center gap-3 mt-0.5">
                <code className="font-mono text-faint">{t.prefix}…</code>
                <span>created {formatDistanceToNow(new Date(t.createdAt), { addSuffix: true })}</span>
                <span>
                  {t.lastUsedAt
                    ? `used ${formatDistanceToNow(new Date(t.lastUsedAt), { addSuffix: true })}`
                    : "never used"}
                </span>
              </div>
            </div>
            <button
              className="text-faint hover:text-danger p-1 -m-1"
              onClick={() => {
                if (confirm(`Revoke token "${t.name}"? Any client using it stops working.`)) {
                  revoke.mutate(t.id);
                }
              }}
              title="Revoke"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
