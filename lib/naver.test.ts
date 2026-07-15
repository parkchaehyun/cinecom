import { describe, it, expect } from "vitest";
import { doubleEncode } from "./naver";
import { buildTitle } from "./title";

/**
 * The cafe write API percent-decodes twice and mangles the text in between, so the body
 * must be encoded twice. Six variants were posted to the real cafe and read back — every
 * single-encoded form (UTF-8, CP949, EUC-KR, raw bytes, `+` or `%20` spaces) came back
 * corrupted. Guarded here because the failure is SILENT: the post succeeds with HTTP 200
 * and only the stored title is wrong.
 */
describe("doubleEncode", () => {
  // What Naver effectively does: decode once (the mangle-prone stage sees only ASCII),
  // then decode again.
  const naverDecodesTwice = (s: string) => decodeURIComponent(decodeURIComponent(s));

  it("encodes twice, so Naver's first pass yields plain ASCII", () => {
    const once = encodeURIComponent("미정"); // %EB%AF%B8%EC%A0%95
    expect(doubleEncode("미정")).toBe("%25EB%25AF%25B8%25EC%25A0%2595");
    // After Naver's first decode the payload is pure ASCII — nothing for the bug to corrupt.
    expect(decodeURIComponent(doubleEncode("미정"))).toBe(once);
    expect(/^[\x20-\x7E]*$/.test(once)).toBe(true);
  });

  it("survives Naver's two decodes", () => {
    for (const s of ["미정", "대상영실", "수요일", "인코딩테스트"]) {
      expect(naverDecodesTwice(doubleEncode(s)), s).toBe(s);
    }
  });

  it("round-trips a real canonical title", () => {
    const title = buildTitle({ date: "2026-07-15", room: "대상영실", startMin: 23 * 60, endMin: 1439, movie: "" });
    expect(title).toBe("7월 15일 수요일 / 대상영실 / 23:00 - 23:59 / 미정");
    expect(naverDecodesTwice(doubleEncode(title))).toBe(title);
  });

  it("round-trips awkward real movie titles", () => {
    for (const s of ["나, 너, 그, 그녀", "쿨레 밤페 혹은 세계의 주인은 누구인가?", "장고: 분노의 추적자", "대부 2", "."]) {
      expect(naverDecodesTwice(doubleEncode(s)), s).toBe(s);
    }
  });

  it("folds double quotes, which the write API rejects", () => {
    // Real corpus title: `"나의 최애 뮤직비디오" 상영회`
    expect(naverDecodesTwice(doubleEncode('"나의 최애 뮤직비디오" 상영회'))).toBe("'나의 최애 뮤직비디오' 상영회");
  });

  it("never leaves a bare space or & that could break the form body", () => {
    const enc = doubleEncode("7월 15일 / 대상영실 & 소상영실");
    expect(enc).not.toMatch(/[ &]/);
  });
});
