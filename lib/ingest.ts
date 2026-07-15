// Ingest: crawl the rolling window, parse reservations, persist + reconcile deletions.
import { fetchBoardPage } from "./naver";
import { parseTitle } from "./parser/parse";
import { supabaseAdmin } from "./supabase";
import type { ParsedSlot, RawPost } from "./types";

const DAY = 86_400_000;
const HORIZON_DAYS = 90; // crawl back this far by write-time (must exceed max booking lead time)
const MAX_PAGES = 40; // safety cap (~90d ≈ 16 pages)

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
  const seenIds = new Set(ids);

  // 1. Upsert every crawled post (re-marks previously-missing ones as present).
  const postRows = parsed.map(({ post, isReservation, parseStatus }) => ({
    article_id: post.articleId,
    menu_id: post.menuId,
    menu_name: post.menuName,
    subject: post.subject,
    writer_nick: post.writerNick,
    write_ts: new Date(post.writeTs).toISOString(),
    is_reservation: isReservation,
    parse_status: parseStatus,
    last_seen: nowIso,
    missing_since: null,
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

  // 3. Reconcile deletions: posts previously seen in-window but absent from this crawl → freed.
  let gone: number[] = [];
  if (reconcile) {
    const cutoffIso = new Date(Date.now() - HORIZON_DAYS * DAY).toISOString();
    const { data: prior } = await supa
      .from("posts")
      .select("article_id")
      .gte("write_ts", cutoffIso)
      .is("missing_since", null);
    gone = (prior ?? []).map((r) => r.article_id as number).filter((id) => !seenIds.has(id));
    if (gone.length) {
      await supa.from("posts").update({ missing_since: nowIso }).in("article_id", gone);
      await supa.from("slots").delete().in("article_id", gone);
    }
  }

  return {
    crawled: parsed.length,
    reservations: parsed.filter((p) => p.isReservation).length,
    slots: slotRows.length,
    removed: gone.length,
  };
}
