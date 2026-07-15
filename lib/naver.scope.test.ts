import { describe, it, expect, vi, afterEach } from "vitest";
import { postArticle, CafeScopeError } from "./naver";

const reply = (status: number, body: unknown) =>
  vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: status < 400,
    status,
    json: async () => body,
  } as Response);

afterEach(() => vi.restoreAllMocks());

describe("postArticle — declining 카페 at login", () => {
  // Verbatim from a real member who left 카페 (a 선택 consent) unticked.
  const REAL = { errorMessage: "Scope Status Invalid : Authentication failed. (인증에 실패했습니다.)", errorCode: "024" };

  it("classifies 024 as a recoverable scope problem, not a dead login", async () => {
    reply(401, REAL);
    await expect(postArticle({ accessToken: "t", subject: "s", content: "." })).rejects.toBeInstanceOf(CafeScopeError);
  });

  it("does not mistake other 401s for it — those are expired tokens, not missing scope", async () => {
    reply(401, { errorMessage: "Authentication failed", errorCode: "028" });
    await expect(postArticle({ accessToken: "t", subject: "s", content: "." })).rejects.not.toBeInstanceOf(CafeScopeError);
  });

  it("leaves a successful write alone", async () => {
    reply(200, { message: { status: "200" } });
    await expect(postArticle({ accessToken: "t", subject: "s", content: "." })).resolves.toBeTruthy();
  });
});
