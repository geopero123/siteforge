import { NextResponse } from "next/server";
import { ZodError } from "zod";
// Problems with what the user sent, reported as 400 rather than server errors.
export class RequestError extends Error {}
export function apiError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Unexpected request failure";
  return NextResponse.json(
    {
      error:
        error instanceof ZodError
          ? error.issues.map((i) => i.message).join("; ")
          : message,
    },
    {
      status:
        message === "UNAUTHORIZED"
          ? 401
          : message === ORIGIN_REJECTED
            ? 403
            : error instanceof ZodError || error instanceof RequestError
              ? 400
              : 500,
    },
  );
}
const ORIGIN_REJECTED = "Request origin rejected";
// Same check Next.js uses for server actions: the browser-set Origin must name
// the host the request was sent to. request.url alone is not enough, because
// Next.js may report its own bind address (such as localhost) behind proxies.
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  let originHost: string;
  try {
    originHost = new URL(origin ?? "").host;
  } catch {
    throw new Error(ORIGIN_REJECTED);
  }
  const forwarded = request.headers.get("x-forwarded-host");
  const hosts = [
    new URL(request.url).host,
    forwarded?.split(",")[0].trim() || request.headers.get("host"),
  ];
  if (!hosts.includes(originHost)) throw new Error(ORIGIN_REJECTED);
}
