// Ingest: crawl the rolling window, parse reservations, persist + reconcile deletions.
import { fetchBoardPage } from "./naver";
import { parseTitle } from "./parser/parse";
import { supabaseAdmin } from "./supabase";
import type { ParsedSlot, RawPost } from "./types";

const DAY = 86_400_000;
/**
 * Crawl back this far by write-time. Must exceed the longest booking lead time, since a post
 * outside it is never re-read — so an edit or deletion to it can never be noticed.
 *
 * MUST ALSO STAY BELOW RETAIN_DAYS. When the two were equal (both 90) the crawl kept re-adding
 * the very rows the purge had just deleted: 4 posts churned on every single ingest, which meant
 * their nicknames were re-stored every 10 minutes and the 90-day promise was quietly worthless.
 * Keeping the crawl strictly inside the retention window means the purge only ever removes rows
 * the crawl can no longer see, so deletion is final.
 *
 * 60 is comfortable: the board only shows today+30, so nothing can be booked further ahead
 * through this app, and that leaves 2x margin over the longest lead time it can produce.
 */
const HORIZON_DAYS = 60;
const MAX_PAGES = 40; // safety cap (~60d ≈ 11 pages)
/**
 * Drop showings this far past. The board can only ever read mondayOf(today)−7 → today+30, so
 * anything older than ~37 days is already invisible to it; 90 gives 2.4x margin and still turns
 * "보유기간: 영구" into a real, disclosable retention period. Every row holds a member's cafe
 * nickname, so keeping ones we can't display is collection without a purpose.
 */
const RETAIN_DAYS = 90;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type ParseStatus = "ok" | "needs_review" | "not_reservation" | "blinded";
export interface ParsedPost {
  post: RawPost;
  isReservation: boolean;
  parseStatus: ParseStatus;
  slots: (ParsedSlot & { articleId: number })[];
}

// Crawl menu 0 back to the horizon and parse every post. Pure (no DB) — verifiable against the live cafe.
export async function crawlAndParse(maxPages = MAX_PAGES): Promise<ParsedPost[]> {
  const cutoff = Date.now() - HORIZON_DAYS * DAY;
  const seen = new Set<number>();
  const posts: RawPost[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const batch = await fetchBoardPage(page);
    if (!batch.length) break;
    for (const p of batch) {
      if (!seen.has(p.articleId)) {
        seen.add(p.articleId);
        posts.push(p);
      }
    }
    if (Math.min(...batch.map((p) => p.writeTs)) < cutoff) break;
    await sleep(250);
  }

  return posts.map<ParsedPost>((post) => {
    if (post.blindArticle) return { post, isReservation: false, parseStatus: "blinded", slots: [] };
    const r = parseTitle(post.subject, post.writeTs);
    if (!r.isReservation) return { post, isReservation: false, parseStatus: "not_reservation", slots: [] };
    const needsReview = r.slots.some((s) => s.needsReview);
    return {
      post,
      isReservation: true,
      parseStatus: needsReview ? "needs_review" : "ok",
      slots: r.slots.map((s) => ({ ...s, articleId: post.articleId })),
    };
  });
}

export interface IngestResult {
  crawled: number;
  reservations: number;
  slots: number;
  removed: number;
  /** Rows deleted for passing the retention window. */
  purged: number;
}

export interface IngestOptions {
  /** Pages of menu 0 to crawl. The default walks the full horizon. */
  maxPages?: number;
  /**
   * Reconcile deletions (DB posts absent from the crawl → freed). Only valid on a FULL
   * crawl: on a shallow pass every post outside the first pages looks "missing" and would
   * be wrongly freed.
   */
  reconcile?: boolean;
}

export async function runIngest({ maxPages = MAX_PAGES, reconcile = true }: IngestOptions = {}): Promise<IngestResult> {
  const parsed = await crawlAndParse(maxPages);
  const supa = supabaseAdmin();
  const nowIso = new Date().toISOString();
  const ids = parsed.map((p) => p.post.articleId);
  // Store ONLY reservations. menus/0 is 전체글보기, so the crawl sees every post in the cafe —
  // 공지, 잡담, everything — and we were persisting each one's writer_nick despite nothing ever
  // reading it: `is_reservation` and `parse_status` are written here and queried nowhere. That's
  // other people's names kept for no purpose, which is precisely what a privacy policy can't
  // justify. `ids` still covers every crawled post below, so a booking retitled into a
  // non-reservation still gets its slots dropped and is reconciled as gone.
  const reservations = parsed.filter((p) => p.isReservation);
  const seenIds = new Set(reservations.map((p) => p.post.articleId));

  // 1. Upsert every crawled RESERVATION.
  const postRows = reservations.map(({ post, isReservation, parseStatus }) => ({
    article_id: post.articleId,
    menu_id: post.menuId,
    menu_name: post.menuName,
    subject: post.subject,
    writer_nick: post.writerNick,
    write_ts: new Date(post.writeTs).toISOString(),
    is_reservation: isReservation,
    parse_status: parseStatus,
    last_seen: nowIso,
  }));
  if (postRows.length) {
    const { error } = await supa.from("posts").upsert(postRows, { onConflict: "article_id" });
    if (error) throw new Error(`posts upsert: ${error.message}`);
  }

  // 2. Replace slots for these posts (re-parse reflects any title edits).
  if (ids.length) await supa.from("slots").delete().in("article_id", ids);
  const slotRows = parsed.flatMap((p) =>
    p.slots.map((s) => ({
      article_id: s.articleId,
      room: s.room,
      date: s.date,
      start_min: Number.isNaN(s.startMin) ? null : s.startMin,
      end_min: Number.isNaN(s.endMin) ? null : s.endMin,
      movie: s.movie,
      person: s.person,
      canceled: s.canceled,
      needs_review: s.needsReview,
      confidence: s.confidence,
    })),
  );
  if (slotRows.length) {
    const { error } = await supa.from("slots").insert(slotRows);
    if (error) throw new Error(`slots insert: ${error.message}`);
  }

  // 3. Reconcile deletions: posts previously seen in-window but absent from this crawl.
  //    Deleted from the cafe → deleted here, now, not in 90 days. A member removing their post is
  //    them withdrawing it, and our copy loses its only purpose the moment the slot it described
  //    stops existing; holding their nickname past that is retention no one asked for. This used
  //    to only stamp `missing_since` and drop the slots, leaving the post row — nickname, title
  //    and all — sitting for the rest of the retention window. That soft marker bought nothing:
  //    it existed solely to keep the row out of this very query, which a real delete does better.
  //    Safe because the cafe is the source of truth, so a post that turns out to be alive is
  //    simply re-added by the next crawl.
  let gone: number[] = [];
  if (reconcile) {
    const cutoffIso = new Date(Date.now() - HORIZON_DAYS * DAY).toISOString();
    const { data: prior } = await supa.from("posts").select("article_id").gte("write_ts", cutoffIso);
    gone = (prior ?? []).map((r) => r.article_id as number).filter((id) => !seenIds.has(id));
    if (gone.length) {
      const { error } = await supa.from("posts").delete().in("article_id", gone); // slots cascade
      if (error) throw new Error(`reconcile delete: ${error.message}`);
    }
  }

  // 4. Expire anything past the retention window. Runs on every ingest rather than on a separate
  //    schedule: one less moving part, and a deletion policy that only works if a second cron is
  //    alive is a deletion policy that quietly stops.
  const purged = await purgeExpired(supa);

  return {
    crawled: parsed.length,
    reservations: reservations.length,
    slots: slotRows.length,
    removed: gone.length,
    purged,
  };
}

/**
 * Delete posts whose showings are all more than RETAIN_DAYS past, and any post that yielded no
 * showing at all. Slots follow via `on delete cascade`.
 *
 * Keyed on the SHOWING date, not write time: a booking made 89 days ago for a screening 89 days
 * ago is equally unreadable, while write-time keying would fight the 90-day crawl horizon at its
 * boundary — purging rows the next crawl re-adds, forever. A post is spared while any of its
 * showings is still inside the window, so a long-lead booking is never dropped early, and the
 * write_ts guard keeps a fresh post safe even if its parsed date is nonsense.
 */
async function purgeExpired(supa: ReturnType<typeof supabaseAdmin>): Promise<number> {
  const cutoff = Date.now() - RETAIN_DAYS * DAY;
  const cutoffDate = new Date(cutoff).toISOString().slice(0, 10);
  const cutoffIso = new Date(cutoff).toISOString();

  const { data: live } = await supa.from("slots").select("article_id").gte("date", cutoffDate);
  const keep = new Set((live ?? []).map((r) => r.article_id as number));

  const { data: all } = await supa.from("posts").select("article_id, write_ts").lt("write_ts", cutoffIso);
  const doomed = (all ?? []).map((r) => r.article_id as number).filter((id) => !keep.has(id));
  if (!doomed.length) return 0;

  const { error } = await supa.from("posts").delete().in("article_id", doomed);
  if (error) throw new Error(`purge: ${error.message}`);
  return doomed.length;
}
