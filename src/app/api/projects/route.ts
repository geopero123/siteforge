import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
import { apiError, assertSameOrigin, RequestError } from "@/lib/api";
import { parseTarget } from "@/lib/security/url";
import { repositoryReferenceSchema as repositorySchema } from "@/lib/repository/reference";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { db, user } = await requireUser();
    const input = z
      .object({
        name: z.string().trim().min(1).max(100),
        url: z.url().optional(),
        repository: repositorySchema.optional(),
      })
      .refine((value) => value.url || value.repository, {
        message: "Provide a website URL, a GitHub repository, or both",
      })
      .parse(await request.json());
    if (input.url)
      try {
        parseTarget(input.url);
      } catch (e) {
        throw new RequestError((e as Error).message);
      }
    const { data, error } = await db
      .from("projects")
      .insert({ ...input, user_id: user.id })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json(data, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
