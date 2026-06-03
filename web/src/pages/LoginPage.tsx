import { Loader2, LogIn } from "lucide-react";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";

export function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || "/";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.login(password);
      // Replace so the back button doesn't go to /login.
      navigate(next, { replace: true });
    } catch (err) {
      // Distinguish "wrong password" from "everything else" without leaking
      // server detail strings to the surface.
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("401") || msg.includes("invalid_password")) {
        setError("密码不对");
      } else if (msg.includes("rate_limited") || msg.includes("429")) {
        setError("登录尝试过频，稍候再试");
      } else {
        setError("登录失败 — 服务可能离线");
      }
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-bg px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm bg-surface border border-line rounded-lg shadow-sm p-6 space-y-5"
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-accent flex items-center justify-center text-white text-sm font-bold">
            b
          </div>
          <div>
            <div className="text-sm font-semibold text-ink leading-tight">botnote</div>
            <div className="text-xxs text-muted">Sign in to continue</div>
          </div>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-ink2">Password</span>
          <input
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-md border border-line bg-bg focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
            disabled={busy}
          />
        </label>

        {error && (
          <div className="text-xs text-red-500 bg-red-500/10 border border-red-500/30 rounded px-2.5 py-1.5">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={!password || busy}
          className="w-full btn btn-primary justify-center gap-2 py-2"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} />}
          <span>{busy ? "Signing in…" : "Sign in"}</span>
        </button>

        <p className="text-xxs text-muted text-center pt-1">
          Session cookie expires in 30 days. CLI / MCP unaffected.
        </p>
      </form>
    </div>
  );
}
