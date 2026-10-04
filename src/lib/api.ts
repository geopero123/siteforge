import { NextResponse } from "next/server";
import { ZodError } from "zod";
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
          : error instanceof ZodError
            ? 400
            : 500,
    },
  );
}
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin)
    throw new Error("Request origin rejected");
}
