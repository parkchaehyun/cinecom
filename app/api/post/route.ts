import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSlots } from "@/lib/slots";
import { buildTitle } from "@/lib/title";
import { DEFAULT_MENU_ID, postArticle } from "@/lib/naver";
import { runIngest } from "@/lib/ingest";
import { ROOMS } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface Body {
  date?: string;
  room?: string;
  startMin?: number;
  endMin?: number;
  movie?: string;
  person?: string;
  body?: string;
  menuId?: number;
}

const bad = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.accessToken) return bad("네이버 로그인이 필요합니다.", 401);
  if (session.error) return bad("네이버 로그인이 만료되었습니다. 다시 로그인해 주세요.", 401);

  const b = (await req.json().catch(() => ({}))) as Body;
  const { date, room, startMin, endMin } = b;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad("날짜가 올바르지 않습니다.");
  if (!room || !(ROOMS as readonly string[]).includes(room)) return bad("상영실이 올바르지 않습니다.");
  if (typeof startMin !== "number" || typeof endMin !== "number") return bad("시간이 올바르지 않습니다.");
  if (endMin <= startMin) return bad("종료 시간이 시작 시간보다 빨라요.");

  // The cafe is the source of truth and we cannot lock a slot, so re-check as late as
  // possible: someone may have posted between the board loading and this submit.
  const taken = (await getSlots(date, date)).find(
    (s) => s.room === room && s.startMin < endMin && startMin < s.endMin,
  );
  if (taken) {
    return NextResponse.json(
      {
        error: "이미 예약된 시간과 겹칩니다.",
        conflict: { movie: taken.movie, startMin: taken.startMin, endMin: taken.endMin },
      },
      { status: 409 },
    );
  }

  const subject = buildTitle({ date, room, startMin, endMin, movie: b.movie, person: b.person });
  const content = b.body?.trim() || "."; // members really do post a bare "."

  try {
    await postArticle({
      accessToken: session.accessToken,
      subject,
      content,
      menuId: b.menuId ?? DEFAULT_MENU_ID,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }

  // The board reads the DB, not the cafe, so without this the member's own booking
  // wouldn't appear until the next cron. Shallow pass (newest pages, no reconcile).
  // Never fail the response over this — the post itself already succeeded.
  let ingested = false;
  try {
    await runIngest({ maxPages: 2, reconcile: false });
    ingested = true;
  } catch {
    /* the scheduled ingest will pick it up */
  }
  return NextResponse.json({ ok: true, subject, ingested });
}
