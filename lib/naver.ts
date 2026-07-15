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

/** A board a reservation post may be written to. */
export interface Board {
  menuId: number;
  menuName: string;
}

/** Standing reservation boards, outside any year folder. 13 is the canonical one and the default. */
const STANDING_BOARDS = [DEFAULT_MENU_ID, 14, 85];

const MENU_LIST = "https://apis.naver.com/cafe-web/cafe2/SideMenuList";

interface SideMenu {
  menuId: number;
  menuName: string;
  menuType: string; // S = section, F = folder, B = board, M = other
  indent: boolean; // true = sits inside the folder above it
  boardType?: string;
}

/**
 * Boards a member may post a reservation to: the two 상영실 boards, the standing 정기 영화 모임,
 * and every board filed under THIS YEAR's folder in the cafe's own menu.
 *
 * Read from the cafe rather than hardcoded, because the 소모임 list is rewritten every year — the
 * club adds a "2027년" folder and a fresh set of boards, and a baked-in list would quietly go stale
 * while looking fine. The menu tree gives us the real structure: menuType "F" opens a folder and
 * `indent` marks its children, so "under 2026년" is a structural query, not a guess from names.
 * (Name-matching would be hopeless anyway: only one board happens to carry a year, 영화와 정치경제
 * 세미나(26), and that's its actual title rather than a convention.)
 *
 * Falls back to the standing boards if the menu can't be read — an unavailable list must not stop
 * anyone booking on the board 96% of reservations already use.
 */
export async function fetchBoards(): Promise<Board[]> {
  const year = new Date(Date.now() + 9 * 3600_000).getUTCFullYear(); // KST
  const fallback = STANDING_BOARDS.map((menuId) => ({ menuId, menuName: "" }));
  try {
    const res = await fetch(`${MENU_LIST}?cafeId=${CLUB_ID}`, {
      headers: { "User-Agent": UA, Referer: REF },
      next: { revalidate: 3600 }, // the club edits this a few times a year
    });
    if (!res.ok) return fallback;
    const json = (await res.json()) as { message?: { result?: { menus?: SideMenu[] } } };
    const menus = json.message?.result?.menus ?? [];
    if (!menus.length) return fallback;

    const named = new Map(menus.filter((m) => m.menuType === "B").map((m) => [m.menuId, unescapeHtml(m.menuName)]));
    const out: Board[] = [];
    for (const menuId of STANDING_BOARDS) {
      const menuName = named.get(menuId);
      if (menuName) out.push({ menuId, menuName });
    }
    let inYear = false;
    for (const m of menus) {
      if (m.menuType === "F") {
        inYear = m.menuName === `${year}년`;
        continue;
      }
      if (inYear && m.menuType === "B" && m.indent && !STANDING_BOARDS.includes(m.menuId)) {
        out.push({ menuId: m.menuId, menuName: unescapeHtml(m.menuName) });
      }
    }
    return out.length ? out : fallback;
  } catch {
    return fallback;
  }
}

/** Board names arrive HTML-escaped — "&lt;이란&gt; 영화제" is a real one. */
const unescapeHtml = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();

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

/**
 * Percent-encode **twice** for the cafe write API.
 *
 * Naver percent-decodes the body twice, and mangles the text between the two passes
 * (decode-as-UTF-8 → re-encode → read-as-CP949). Single-encoded text gets destroyed by
 * that stage; double-encoded text passes through it as pure ASCII (`%EB%AF%B8…`), which
 * the bug can't touch, and their second decode yields the original.
 *
 * Established by posting six encoding variants and reading them back off the cafe: every
 * single-encoded form (UTF-8, CP949, EUC-KR, raw, `+` or `%20`) came back mangled. The
 * charset was never the problem.
 */
export function doubleEncode(value: string): string {
  return encodeURIComponent(encodeURIComponent(sanitize(value)));
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
  // Hand-built: URLSearchParams would encode once. See doubleEncode.
  const body = [
    `subject=${doubleEncode(subject)}`,
    `content=${doubleEncode(content)}`,
    `openyn=${openToAll}`,
  ].join("&");

  const res = await fetch(`${WRITE_BASE}/${CLUB_ID}/menu/${menuId}/articles`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    // 024 = "Scope Status Invalid". The token is fine; it just doesn't carry 카페 permission,
    // because Naver lists 카페 as a 선택 consent and the member declined it at login. Distinct
    // from an expired token, and recoverable — see CafeScopeError.
    const code = (json as { errorCode?: string } | null)?.errorCode;
    if (res.status === 401 && code === "024") throw new CafeScopeError();
    throw new Error(`cafe write HTTP ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

/**
 * The member is logged in, but their token lacks 카페 permission.
 *
 * Naver marks 카페 as a 선택 item on the consent screen, so it can be declined while login still
 * succeeds — and nothing about the token or the login response says so. Naver's token response
 * carries no `scope` field, so this cannot be detected at login; the first symptom is the write
 * failing. Recoverable: send them back through consent with auth_type=reprompt.
 */
export class CafeScopeError extends Error {
  constructor() {
    super("cafe scope not granted");
    this.name = "CafeScopeError";
  }
}
