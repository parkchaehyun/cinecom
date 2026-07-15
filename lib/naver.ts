// Read client for the 씨네꼼 Naver cafe (public, unofficial boardlist endpoint).
// Verified: no auth/rate-limit; `type` is on the OUTER list object, not `item`.
import iconv from "iconv-lite";
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
 * Percent-encode for the cafe write API, which decodes the form body as **MS949/CP949**
 * regardless of the charset we declare.
 *
 * Proven, not guessed: posting UTF-8 produced `미정` → `誘몄젙` and `수요일` → `닔슂씪`,
 * which is exactly UTF-8 bytes read as CP949. Node can't encode CP949 natively, hence
 * iconv-lite. Space is `+` per application/x-www-form-urlencoded.
 */
export function ms949FormEncode(value: string): string {
  let out = "";
  for (const b of iconv.encode(value, "ms949")) {
    if (b === 0x20) out += "+";
    else if (/[A-Za-z0-9\-_.~]/.test(String.fromCharCode(b))) out += String.fromCharCode(b);
    else out += "%" + b.toString(16).toUpperCase().padStart(2, "0");
  }
  return out;
}

export interface PostArticleInput {
  accessToken: string;
  subject: string;
  content: string;
  menuId?: number;
  openToAll?: boolean;
}

/** Create a cafe post as the token's owner. Returns Naver's raw response. */
export async function postArticle({
  accessToken,
  subject,
  content,
  menuId = DEFAULT_MENU_ID,
  openToAll = true,
}: PostArticleInput): Promise<unknown> {
  // Hand-built body: URLSearchParams would UTF-8 encode, which Naver mis-decodes as CP949.
  const body = [
    `subject=${ms949FormEncode(subject)}`,
    `content=${ms949FormEncode(content)}`,
    `openyn=${openToAll}`,
  ].join("&");

  const res = await fetch(`${WRITE_BASE}/${CLUB_ID}/menu/${menuId}/articles`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded; charset=MS949",
    },
    body,
    cache: "no-store",
  });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`cafe write HTTP ${res.status}: ${JSON.stringify(json)}`);
  return json;
}
