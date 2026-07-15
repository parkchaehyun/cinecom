import { NextResponse } from "next/server";
import { runIngest } from "@/lib/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Called by the scheduled cron (Supabase pg_cron / GitHub Actions). Guarded by a shared secret.
export async function POST(req: Request) {
  const secret = req.headers.get("x-ingest-secret");
  if (!process.env.INGEST_SECRET || secret !== process.env.INGEST_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runIngest();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
