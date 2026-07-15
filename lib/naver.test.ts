import { describe, it, expect } from "vitest";
import iconv from "iconv-lite";
import { cp949FormEncode } from "./naver";
import { buildTitle } from "./title";

// Established by reading three real posts back off the cafe: Naver reads the write body
// as CP949 (unless a charset param flips it to UTF-8). Sending UTF-8 silently stored
// `미정` as `誘몄젙` — the post succeeds, only the title is wrong. Hence these guards.
describe("cp949FormEncode", () => {
  const decode = (enc: string) =>
    iconv.decode(
      Buffer.from(
        enc.replace(/\+/g, " ").replace(/%([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))),
        "binary",
      ),
      "cp949",
    );

  it("emits CP949 bytes, not UTF-8", () => {
    // 미정: CP949 = B9 CC C1 A4. UTF-8 would be EB AF B8 EC A0 95 → stored as 誘몄젙.
    expect(cp949FormEncode("미정")).toBe("%B9%CC%C1%A4");
  });

  it("leaves unreserved ASCII alone and encodes space as +", () => {
    expect(cp949FormEncode("23:00 - 23:59")).toBe("23%3A00+-+23%3A59");
    expect(cp949FormEncode("abcXYZ019-_.~")).toBe("abcXYZ019-_.~");
  });

  it("round-trips a generated canonical title", () => {
    const title = buildTitle({ date: "2026-07-15", room: "대상영실", startMin: 23 * 60, endMin: 1439, movie: "" });
    expect(title).toBe("7월 15일 수요일 / 대상영실 / 23:00 - 23:59 / 미정");
    expect(decode(cp949FormEncode(title))).toBe(title);
  });

  it("round-trips awkward real movie titles", () => {
    for (const s of ["나, 너, 그, 그녀", "쿨레 밤페 혹은 세계의 주인은 누구인가?", "장고: 분노의 추적자", "대부 2", "."]) {
      expect(decode(cp949FormEncode(s)), s).toBe(s);
    }
  });

  it("folds double quotes, which the write API rejects", () => {
    // Real corpus title: `"나의 최애 뮤직비디오" 상영회`
    expect(decode(cp949FormEncode('"나의 최애 뮤직비디오" 상영회'))).toBe("'나의 최애 뮤직비디오' 상영회");
  });
});
