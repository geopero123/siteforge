// In-memory stand-in for the Supabase Auth, PostgREST and Storage endpoints the
// web app calls, so every page can be previewed and tested without a project.
// Never loaded by the production app.
import { createServer, type IncomingMessage } from "node:http";
import * as fixtures from "./fixtures";

type Row = Record<string, unknown>;

// One fixed expiry per process, so every request sees the same access token.
const exp = Math.floor(Date.now() / 1000) + 30 * 86400;
export function sessionCookie(port: number) {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const accessToken = [
    encode({ alg: "HS256", typ: "JWT" }),
    encode({
      sub: fixtures.user.id,
      email: fixtures.user.email,
      role: "authenticated",
      aud: "authenticated",
      exp,
      iat: exp - 3600,
      session_id: "preview-session",
    }),
    "preview-signature",
  ].join(".");
  const session = {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: exp,
    refresh_token: "preview-refresh",
    user: authUser(),
  };
  return {
    name: `sb-${new URL(`http://127.0.0.1:${port}`).hostname.split(".")[0]}-auth-token`,
    value: "base64-" + encode(session),
    accessToken,
  };
}

function authUser() {
  return {
    id: fixtures.user.id,
    aud: "authenticated",
    role: "authenticated",
    email: fixtures.user.email,
    app_metadata: { provider: "email" },
    user_metadata: {},
    created_at: "2026-09-01T00:00:00Z",
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export function createDatabase() {
  return {
    projects: clone(fixtures.projects) as Row[],
    audits: clone(fixtures.audits) as Row[],
    issues: clone(fixtures.issues) as Row[],
    agent_runs: clone(fixtures.agentRuns) as Row[],
    screenshots: clone(fixtures.screenshots) as Row[],
    mission_steps: clone(fixtures.missionSteps) as Row[],
    billing_settings: clone(fixtures.billing.billing_settings) as Row[],
    billing_customers: clone(fixtures.billing.billing_customers) as Row[],
    test_credits: clone(fixtures.billing.test_credits) as Row[],
  } as Record<string, Row[]>;
}

function unquote(value: string) {
  return value.replace(/^"(.*)"$/, "$1");
}

// Supports the PostgREST operators the app uses: eq, in, order and limit.
function applyQuery(rows: Row[], params: URLSearchParams) {
  let result = rows;
  for (const [key, raw] of params) {
    if (["select", "order", "limit", "offset", "columns"].includes(key))
      continue;
    const [operator, ...rest] = raw.split(".");
    const value = rest.join(".");
    if (operator === "eq")
      result = result.filter((row) => String(row[key]) === value);
    else if (operator === "in") {
      const list = value
        .replace(/^\(|\)$/g, "")
        .split(",")
        .map(unquote);
      result = result.filter((row) => list.includes(String(row[key])));
    }
  }
  const order = params.get("order");
  if (order) {
    const [column, direction] = order.split(".");
    result = [...result].sort((a, b) => {
      const left = a[column] as string | number,
        right = b[column] as string | number;
      const compare = left < right ? -1 : left > right ? 1 : 0;
      return direction === "desc" ? -compare : compare;
    });
  }
  const limit = params.get("limit");
  if (limit) result = result.slice(0, Number(limit));
  return result;
}

function select(rows: Row[], params: URLSearchParams) {
  const columns = params.get("select");
  if (!columns || columns === "*") return rows;
  const names = columns.split(",").map((name) => name.trim());
  return rows.map((row) =>
    Object.fromEntries(names.map((name) => [name, row[name] ?? null])),
  );
}

async function body(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString();
  return text ? JSON.parse(text) : undefined;
}

export interface FakeSupabase {
  url: string;
  port: number;
  db: Record<string, Row[]>;
  images: Map<string, Buffer>;
  requests: string[];
  close: () => Promise<void>;
}

export async function startFakeSupabase(options: {
  port?: number;
  images?: Map<string, Buffer>;
  appOrigin?: string;
}): Promise<FakeSupabase> {
  const db = createDatabase();
  const images = options.images ?? new Map<string, Buffer>();
  const requests: string[] = [];
  let port = options.port ?? 0;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    requests.push(`${request.method} ${url.pathname}${url.search}`);
    response.setHeader(
      "Access-Control-Allow-Origin",
      request.headers.origin ?? "*",
    );
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "*");
    response.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,PATCH,DELETE,HEAD,OPTIONS",
    );
    response.setHeader("Access-Control-Expose-Headers", "Content-Range");
    const json = (status: number, value: unknown, headers: Row = {}) => {
      response.writeHead(status, {
        "Content-Type": "application/json",
        ...(headers as Record<string, string>),
      });
      response.end(value === undefined ? "" : JSON.stringify(value));
    };
    if (request.method === "OPTIONS") return json(204, undefined);
    const token = (request.headers.authorization ?? "").replace(/^Bearer /, "");
    const signedIn = token === sessionCookie(port).accessToken;

    // Preview sign-in: cookies are shared across ports on the same host.
    if (url.pathname === "/__signin") {
      const cookie = sessionCookie(port);
      response.writeHead(302, {
        "Set-Cookie": `${cookie.name}=${cookie.value}; Path=/; SameSite=Lax`,
        Location: (options.appOrigin ?? "") + "/dashboard",
      });
      return response.end();
    }

    if (url.pathname.startsWith("/auth/v1/")) {
      const route = url.pathname.slice(9);
      if (route === "user")
        return signedIn
          ? json(200, authUser())
          : json(401, { code: 401, msg: "Invalid token" });
      if (route === "token") {
        const cookie = sessionCookie(port);
        return json(200, {
          access_token: cookie.accessToken,
          token_type: "bearer",
          expires_in: 3600,
          refresh_token: "preview-refresh",
          user: authUser(),
        });
      }
      if (route === "otp") return json(200, {});
      if (route === "logout") return json(204, undefined);
      return json(404, { msg: "Not supported in preview" });
    }

    if (url.pathname.startsWith("/storage/v1/object/sign/")) {
      const path = decodeURIComponent(
        url.pathname.slice("/storage/v1/object/sign/".length),
      );
      if (request.method === "POST")
        return json(200, {
          signedURL: `/object/sign/${path}?token=preview`,
        });
      const image = images.get(path.replace(/^screenshots\//, ""));
      if (!image) return json(404, { message: "Object not found" });
      response.writeHead(200, {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
      });
      return response.end(image);
    }

    if (url.pathname.startsWith("/rest/v1/")) {
      if (!signedIn) return json(401, { message: "JWT required" });
      const table = url.pathname.slice(9);
      const rows = db[table];
      if (!rows)
        return json(404, {
          code: "42P01",
          message: `relation "${table}" does not exist`,
        });
      const single = (request.headers.accept ?? "").includes(
        "vnd.pgrst.object",
      );
      const respond = (list: Row[], status = 200) => {
        const data = select(list, url.searchParams);
        if (single) {
          if (data.length !== 1)
            return json(406, {
              code: "PGRST116",
              message: "JSON object requested, multiple (or no) rows returned",
            });
          return json(status, data[0]);
        }
        return json(status, data, {
          "Content-Range": `0-${Math.max(0, data.length - 1)}/${data.length}`,
        });
      };
      if (request.method === "HEAD" || request.method === "GET") {
        const matched = applyQuery(rows, url.searchParams);
        if (request.method === "HEAD") {
          response.writeHead(200, {
            "Content-Range": `*/${matched.length}`,
          });
          return response.end();
        }
        return respond(matched);
      }
      const payload = await body(request);
      if (request.method === "POST") {
        const now = new Date().toISOString();
        const inserted = (Array.isArray(payload) ? payload : [payload]).map(
          (row: Row) => ({
            id: crypto.randomUUID(),
            created_at: now,
            ...(table === "audits"
              ? {
                  status: "queued",
                  report: null,
                  error: null,
                  started_at: null,
                  finished_at: null,
                  heartbeat_at: null,
                  mission: null,
                  repository: null,
                }
              : {}),
            ...row,
          }),
        );
        rows.push(...inserted);
        return respond(inserted, 201);
      }
      if (request.method === "PATCH") {
        const matched = applyQuery(rows, url.searchParams);
        matched.forEach((row) => Object.assign(row, payload));
        return respond(matched);
      }
    }
    json(404, { message: "Not found" });
  });
  await new Promise<void>((resolve) =>
    server.listen(port, "127.0.0.1", resolve),
  );
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Fake Supabase failed to start");
  port = address.port;
  return {
    url: `http://127.0.0.1:${port}`,
    port,
    db,
    images,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
