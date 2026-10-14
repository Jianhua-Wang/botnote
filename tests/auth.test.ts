import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  authConfigFromEnv,
  clientIp,
  isTrustedProxy,
  requestOrigin,
  type AuthConfig
} from "../src/rest/auth.js";
import { buildServer } from "../src/rest/server.js";
import { EmbeddingService } from "../src/service/embedding.js";
import { createToken } from "../src/service/tokens.js";
import { DEFAULT_SCOPE as S } from "../src/service/scope.js";
import { createTestDb } from "./test_db.js";

const { db, pool } = createTestDb();
const embedding = new EmbeddingService(db);

const LAN_PEER = "192.168.1.20";
const PUBLIC_CLIENT = "203.0.113.9";
const PASSWORD = "auth-test-password";

const enforcing: AuthConfig = { required: true, trustLocalhost: true, trustedProxies: ["loopback"] };

let server: FastifyInstance;
let bearer: string;

function fakeReq(remoteAddress: string, headers: Record<string, string> = {}) {
  return { headers, socket: { remoteAddress }, ip: remoteAddress };
}

beforeAll(async () => {
  await db.execute(sql`TRUNCATE tokens, sessions RESTART IDENTITY CASCADE`);
  process.env.BOTNOTE_PASSWORD = PASSWORD;
  server = await buildServer({ db, embedding, logLevel: "silent", auth: enforcing });
  await server.ready();
  bearer = (await createToken(S, db, { name: "auth-test" })).plaintext;
});

afterAll(async () => {
  delete process.env.BOTNOTE_PASSWORD;
  await server?.close();
  await pool.end();
});

describe("auth config from environment", () => {
  it("defaults to enforcing when a password is configured and the flag is unset", () => {
    expect(authConfigFromEnv({ BOTNOTE_PASSWORD: "x" }).required).toBe(true);
    expect(authConfigFromEnv({}).required).toBe(false);
    expect(authConfigFromEnv({ BOTNOTE_PASSWORD: "x", BOTNOTE_REQUIRE_AUTH: "0" }).required).toBe(false);
    expect(authConfigFromEnv({ BOTNOTE_REQUIRE_AUTH: "1" }).required).toBe(true);
  });

  it("trusts loopback by default and honours overrides", () => {
    const cfg = authConfigFromEnv({});
    expect(cfg.trustLocalhost).toBe(true);
    expect(cfg.trustedProxies).toEqual(["loopback"]);
    const custom = authConfigFromEnv({
      BOTNOTE_TRUST_LOCALHOST: "0",
      BOTNOTE_TRUST_PROXY: "loopback, 10.0.0.5, 172.16.0.0/12"
    });
    expect(custom.trustLocalhost).toBe(false);
    expect(custom.trustedProxies).toEqual(["loopback", "10.0.0.5", "172.16.0.0/12"]);
  });
});

describe("peer classification", () => {
  it("matches loopback in IPv4, IPv6 and v4-mapped forms", () => {
    for (const a of ["127.0.0.1", "::1", "::ffff:127.0.0.1"]) {
      expect(isTrustedProxy(a, ["loopback"])).toBe(true);
    }
    expect(isTrustedProxy(LAN_PEER, ["loopback"])).toBe(false);
  });

  it("matches exact addresses and IPv4 CIDRs", () => {
    expect(isTrustedProxy("10.0.0.5", ["10.0.0.5"])).toBe(true);
    expect(isTrustedProxy("172.20.3.4", ["172.16.0.0/12"])).toBe(true);
    expect(isTrustedProxy("172.32.0.1", ["172.16.0.0/12"])).toBe(false);
    expect(isTrustedProxy("::ffff:10.0.0.5", ["10.0.0.5"])).toBe(true);
  });

  it("only believes forwarded headers from a trusted proxy", () => {
    expect(clientIp(fakeReq("127.0.0.1", { "cf-connecting-ip": PUBLIC_CLIENT }), enforcing)).toBe(PUBLIC_CLIENT);
    expect(clientIp(fakeReq("127.0.0.1", { "x-forwarded-for": `${PUBLIC_CLIENT}, 10.0.0.1` }), enforcing)).toBe(PUBLIC_CLIENT);
    expect(clientIp(fakeReq(LAN_PEER, { "x-forwarded-for": "127.0.0.1" }), enforcing)).toBe(LAN_PEER);
    expect(clientIp(fakeReq(LAN_PEER, { "cf-connecting-ip": "127.0.0.1" }), enforcing)).toBe(LAN_PEER);
    expect(clientIp(fakeReq("127.0.0.1"), enforcing)).toBe("127.0.0.1");
  });

  it("classifies local, proxied and direct origins", () => {
    expect(requestOrigin(fakeReq("127.0.0.1"), enforcing)).toBe("local");
    expect(requestOrigin(fakeReq("127.0.0.1", { "x-forwarded-for": PUBLIC_CLIENT }), enforcing)).toBe("proxied");
    expect(requestOrigin(fakeReq(LAN_PEER), enforcing)).toBe("direct");
    expect(requestOrigin(fakeReq(LAN_PEER, { "x-forwarded-for": "127.0.0.1" }), enforcing)).toBe("direct");
  });
});

describe("auth gate on /v1 (enforcing, loopback trusted)", () => {
  it("lets a direct loopback request through without a credential", async () => {
    const res = await server.inject({ method: "GET", url: "/v1/projects", remoteAddress: "127.0.0.1" });
    expect(res.statusCode).toBe(200);
    const who = await server.inject({ method: "GET", url: "/v1/auth/whoami", remoteAddress: "127.0.0.1" });
    expect(who.json()).toMatchObject({ authenticated: true, via: "trusted_origin", origin: "local" });
  });

  it("rejects a direct LAN request without a credential", async () => {
    const res = await server.inject({ method: "GET", url: "/v1/projects", remoteAddress: LAN_PEER });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "unauthenticated" });
  });

  it("does not let a LAN client forge loopback through x-forwarded-for", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/v1/projects",
      remoteAddress: LAN_PEER,
      headers: { "x-forwarded-for": "127.0.0.1", "cf-connecting-ip": "127.0.0.1" }
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a proxied request without a credential", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/v1/projects",
      remoteAddress: "127.0.0.1",
      headers: { "cf-connecting-ip": PUBLIC_CLIENT, "x-forwarded-for": PUBLIC_CLIENT }
    });
    expect(res.statusCode).toBe(401);
  });

  it("accepts a bearer token from LAN and from behind the proxy", async () => {
    for (const remoteAddress of [LAN_PEER, "127.0.0.1"]) {
      const res = await server.inject({
        method: "GET",
        url: "/v1/auth/whoami",
        remoteAddress,
        headers: { authorization: `Bearer ${bearer}`, "x-forwarded-for": PUBLIC_CLIENT }
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ authenticated: true, via: "bearer" });
    }
    const bad = await server.inject({
      method: "GET",
      url: "/v1/projects",
      remoteAddress: LAN_PEER,
      headers: { authorization: "Bearer bn_not_a_real_token" }
    });
    expect(bad.statusCode).toBe(401);
  });

  it("accepts a session cookie obtained from the master-password login", async () => {
    const login = await server.inject({
      method: "POST",
      url: "/v1/auth/login",
      remoteAddress: LAN_PEER,
      payload: { password: PASSWORD }
    });
    expect(login.statusCode).toBe(200);
    const cookie = login.cookies.find((c) => c.name === "botnote_session");
    expect(cookie).toBeDefined();

    const res = await server.inject({
      method: "GET",
      url: "/v1/auth/whoami",
      remoteAddress: LAN_PEER,
      cookies: { botnote_session: cookie!.value }
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ authenticated: true, via: "cookie", origin: "direct" });

    const wrong = await server.inject({
      method: "POST",
      url: "/v1/auth/login",
      remoteAddress: LAN_PEER,
      payload: { password: "nope" }
    });
    expect(wrong.statusCode).toBe(401);
  });

  it("leaves /health and the web root open", async () => {
    const res = await server.inject({ method: "GET", url: "/health", remoteAddress: LAN_PEER });
    expect(res.statusCode).toBe(200);
  });
});

describe("auth gate variants", () => {
  it("requires a credential from loopback when BOTNOTE_TRUST_LOCALHOST=0", async () => {
    const strict = await buildServer({
      db,
      embedding,
      logLevel: "silent",
      auth: { required: true, trustLocalhost: false, trustedProxies: ["loopback"] }
    });
    try {
      const anon = await strict.inject({ method: "GET", url: "/v1/projects", remoteAddress: "127.0.0.1" });
      expect(anon.statusCode).toBe(401);
      const withToken = await strict.inject({
        method: "GET",
        url: "/v1/projects",
        remoteAddress: "127.0.0.1",
        headers: { authorization: `Bearer ${bearer}` }
      });
      expect(withToken.statusCode).toBe(200);
    } finally {
      await strict.close();
    }
  });

  it("reports auth_disabled and lets everything through when not required", async () => {
    const open = await buildServer({
      db,
      embedding,
      logLevel: "silent",
      auth: { required: false, trustLocalhost: true, trustedProxies: ["loopback"] }
    });
    try {
      const res = await open.inject({ method: "GET", url: "/v1/auth/whoami", remoteAddress: LAN_PEER });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ authenticated: true, via: "auth_disabled", origin: "direct" });
    } finally {
      await open.close();
    }
  });
});
