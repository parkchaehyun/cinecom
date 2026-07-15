// Read client for the 씨네꼼 Naver cafe (public, unofficial boardlist endpoint).
// Verified: no auth/rate-limit; `type` is on the OUTER list object, not `item`.
import type { RawPost } from "./types";

export const CLUB_ID = 26859626;
export const DEFAULT_MENU_ID = 13; // 꼼인 상영실 예약 — the main member board
const BASE = "https://apis.naver.com/cafe-web/cafe-boardlist-api/v1";
const WRITE_BASE = "https://openapi.naver.com/v1/cafe";
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15";
const REF = "https://m.cafe.naver.com/ca-fe/web/cafes/cinecom/menus/0";

interface BoardListEntry {
  type: string;
  item?: {
    articleId: number;
    menuId: number;
    menuName: string;
    subject: string;
    writeDateTimestamp: number;
    blindArticle?: boolean;
    writerInfo?: { nickName?: string };
  };
}

// Fetch one page of the "all posts" feed (menu 0). Returns ~15 items regardless of perPage.
export async function fetchBoardPage(
  page: number,
  menuId = 0,
  perPage = 50,
): Promise<RawPost[]> {
  const url = `${BASE}/cafes/${CLUB_ID}/menus/${menuId}/articles?page=${page}&perPageCount=${perPage}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Referer: REF },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`boardlist page ${page} -> HTTP ${res.status}`);
  const json = (await res.json()) as { result?: { articleList?: BoardListEntry[] } };
  const list = json?.result?.articleList ?? [];
  return list
    .filter((a): a is Required<BoardListEntry> => a.type === "ARTICLE" && !!a.item)
    .map((a) => ({
      articleId: a.item.articleId,
      menuId: a.item.menuId,
      menuName: a.item.menuName,
      subject: a.item.subject,
      writerNick: a.item.writerInfo?.nickName ?? "",
      writeTs: a.item.writeDateTimestamp,
      blindArticle: a.item.blindArticle ?? false,
    }));
}

// ── Write path (official Naver Cafe API) ──────────────────────────────────────
// Posts as the logged-in member, using their Naver Login access token.

export interface PostArticleInput {
  accessToken: string;
  subject: string;
  content: string;
  menuId?: number;
  openToAll?: boolean;
}

/**
 * Create a cafe post. Returns Naver's raw response.
 *
 * Encoding: Naver's own sample code is known to mangle Hangul. Params are sent
 * percent-encoded as UTF-8 with a matching charset — isolated here so it can be
 * swapped to MS949 if a real round-trip proves otherwise. Verify with a live
 * create→delete before trusting it.
 */
export async function postArticle({
  accessToken,
  subject,
  content,
  menuId = DEFAULT_MENU_ID,
  openToAll = true,
}: PostArticleInput): Promise<unknown> {
  const res = await fetch(`${WRITE_BASE}/${CLUB_ID}/menu/${menuId}/articles`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
    },
    body: new URLSearchParams({ subject, content, openyn: String(openToAll) }),
    cache: "no-store",
  });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`cafe write HTTP ${res.status}: ${JSON.stringify(json)}`);
  return json;
}
