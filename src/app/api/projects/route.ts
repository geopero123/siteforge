import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
import { apiError, assertSameOrigin } from "@/lib/api";
import { parseTarget } from "@/lib/security/url";
import { repositorySchema } from "@/lib/github/repository";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { db, user } = await requireUser();
    const input = z
      .object({
        name: z.string().trim().min(1).max(100),
        url: z.url(),
        repository: repositorySchema.optional(),
      })
      .parse(await request.json());
    parseTarget(input.url);
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
