import { NextRequest, NextResponse } from "next/server";
import { reorderQueue } from "@/lib/db";

// PUT /api/queue
// Body: { ids: number[] } — the full reading queue in the desired order.
// Sets queue_position to each id's index + 1.
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const ids = body.ids;

    if (!Array.isArray(ids) || !ids.every((id) => Number.isInteger(id))) {
      return NextResponse.json({ error: "ids must be an array of integers" }, { status: 400 });
    }

    await reorderQueue(ids);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
