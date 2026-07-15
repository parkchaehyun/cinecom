import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSlots } from "@/lib/slots";
import { findClash } from "@/lib/occupancy";
import { addDays } from "@/lib/dates";
import { buildTitle } from "@/lib/title";
import { CafeScopeError, DEFAULT_MENU_ID, postArticle } from "@/lib/naver";
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
  // Widen the window by a day either side — the club books overnight (22:30-25:30), so a
  // booking from YESTERDAY can still occupy this morning, and a request past midnight
  // reaches into tomorrow. A same-date-only check silently allows both.
  const context = await getSlots(addDays(date, -1), addDays(date, 1));
  const clash = findClash(date, room, startMin, endMin, context);
  if (clash) {
    return NextResponse.json(
      {
        error: "이미 예약된 시간과 겹칩니다.",
        conflict: {
          movie: clash.slot.movie,
          startMin: clash.slot.startMin,
          endMin: clash.slot.endMin,
        },
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
    // Declined 카페 permission at login — recoverable, and the client knows how: re-consent.
    if (e instanceof CafeScopeError) {
      return NextResponse.json(
        {
          error: "네이버 로그인할 때 '카페' 항목에 동의해야 예약글을 작성할 수 있어요.",
          needsCafeConsent: true,
        },
        { status: 403 },
      );
    }
    // Anything else: log the detail, show the member a sentence. This used to return
    // (e as Error).message, which put `cafe write HTTP 401: {"errorMessage":...}` on screen.
    console.error("cafe write failed:", e);
    return NextResponse.json(
      { error: "예약글 작성에 실패했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 502 },
    );
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
