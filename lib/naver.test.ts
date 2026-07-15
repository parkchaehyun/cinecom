import { describe, it, expect } from "vitest";
import iconv from "iconv-lite";
import { ms949FormEncode } from "./naver";

// The cafe write API decodes the form body as MS949/CP949 whatever charset we declare.
// Sending UTF-8 silently posted `미정` as `誘몄젙` to the real cafe — hence these guards.
describe("ms949FormEncode", () => {
  const decode = (enc: string) =>
    iconv.decode(
      Buffer.from(
        enc.replace(/\+/g, " ").replace(/%([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))),
        "binary",
      ),
      "ms949",
    );

  it("emits CP949 bytes, not UTF-8", () => {
    // 미정: CP949 = B9 CC C1 A4, UTF-8 would be EB AF B8 EC A0 95
    expect(ms949FormEncode("미정")).toBe("%B9%CC%C1%A4");
  });

  it("leaves unreserved ASCII alone and encodes space as +", () => {
    expect(ms949FormEncode("23:00 - 23:59")).toBe("23%3A00+-+23%3A59");
    expect(ms949FormEncode("abcXYZ019-_.~")).toBe("abcXYZ019-_.~");
  });

  it("round-trips a real canonical title", () => {
    const title = "7월 15일 수요일 / 대상영실 / 23:00 - 23:59 / 미정";
    expect(decode(ms949FormEncode(title))).toBe(title);
  });

  it("round-trips movie titles with awkward characters", () => {
    for (const s of ["나, 너, 그, 그녀", "쿨레 밤페 혹은 세계의 주인은 누구인가?", "장고: 분노의 추적자", "대부 2", "."]) {
      expect(decode(ms949FormEncode(s)), s).toBe(s);
    }
  });
});
