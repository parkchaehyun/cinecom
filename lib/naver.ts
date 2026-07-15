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

/**
 * Naver's cafe write API rejects double quotes in subject/content, so fold them to
 * single quotes — real movie titles contain them (e.g. `"나의 최애 뮤직비디오" 상영회`).
 */
const sanitize = (s: string) => s.replace(/"/g, "'");

export interface PostArticleInput {
  accessToken: string;
  subject: string;
  content: string;
  menuId?: number;
  openToAll?: boolean;
}

/**
 * Create a cafe post as the token's owner. Returns Naver's raw response.
 *
 * Encoding, the hard way (two real posts to get here):
 * - UTF-8 body + `charset=utf-8` → stored `미정` as `誘몄젙`.
 * - CP949 body + `charset=MS949` → stored it as `占쏙옙`, which decodes as our CP949
 *   bytes read as UTF-8 — proving Naver decodes the body as **UTF-8**.
 *
 * So the body is plain UTF-8 percent-encoding (what URLSearchParams emits, and what
 * Python's urlencode emits in the community's working sample) and the Content-Type
 * carries **no charset parameter** — declaring one is what corrupted the first attempt.
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
      "Content-Type": "application/x-www-form-urlencoded", // no charset — see above
    },
    body: new URLSearchParams({
      subject: sanitize(subject),
      content: sanitize(content),
      openyn: String(openToAll),
    }),
    cache: "no-store",
  });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`cafe write HTTP ${res.status}: ${JSON.stringify(json)}`);
  return json;
}
