import { Button } from "@cloudflare/kumo/components/button";
import { Input } from "@cloudflare/kumo/components/input";
import { SignInIcon } from "@phosphor-icons/react";
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
    <div className="min-h-screen w-full flex items-center justify-center bg-kumo-canvas px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm bg-kumo-base border border-kumo-line rounded-lg shadow-xs p-6 space-y-5"
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-kumo-brand flex items-center justify-center text-white text-sm font-bold">
            b
          </div>
          <div>
            <div className="text-sm font-semibold text-kumo-default leading-tight">botnote</div>
            <div className="text-xxs text-kumo-subtle">Sign in to continue</div>
          </div>
        </div>

        <Input
          label="Password"
          type="password"
          autoFocus
          autoComplete="current-password"
          className="w-full"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
        />

        {error && (
          <div
            role="alert"
            className="text-xs text-kumo-danger bg-kumo-danger-tint border border-kumo-danger/30 rounded-md px-2.5 py-1.5"
          >
            {error}
          </div>
        )}

        <Button
          type="submit"
          variant="primary"
          className="w-full"
          loading={busy}
          icon={<SignInIcon size={14} />}
          disabled={!password || busy}
        >
          {busy ? "Signing in…" : "Sign in"}
        </Button>

        <p className="text-xxs text-kumo-subtle text-center pt-1">
          Session cookie expires in 30 days. CLI / MCP unaffected.
        </p>
      </form>
    </div>
  );
}
