import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
import { apiError, assertSameOrigin } from "@/lib/api";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const { db } = await requireUser();
    const { id } = await params;
    const { status } = z
      .object({ status: z.enum(["open", "resolved", "ignored"]) })
      .parse(await request.json());
    const { data, error } = await db
      .from("issues")
      .update({ status })
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (e) {
    return apiError(e);
  }
}
