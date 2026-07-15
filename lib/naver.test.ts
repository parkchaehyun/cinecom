import { describe, it, expect } from "vitest";
import { buildTitle } from "./title";

// The cafe write API rejects double quotes in subject/content, and real movie titles
// contain them — e.g. the corpus has `"나의 최애 뮤직비디오" 상영회`.
describe("cafe post payload", () => {
  it("produces a title containing quotes that must be sanitised before posting", () => {
    const subject = buildTitle({
      date: "2026-05-23",
      room: "대상영실",
      startMin: 13 * 60,
      endMin: 15 * 60,
      movie: '"나의 최애 뮤직비디오" 상영회',
    });
    expect(subject).toContain('"');
    // postArticle folds " → ' on the way out; assert the shape it will send.
    expect(subject.replace(/"/g, "'")).toBe(
      "5월 23일 토요일 / 대상영실 / 13:00 - 15:00 / '나의 최애 뮤직비디오' 상영회",
    );
  });

  it("URLSearchParams emits UTF-8 percent-encoding (what Naver decodes)", () => {
    // 미정 as UTF-8 = EB AF B8 EC A0 95. If this ever emits CP949 (B9 CC C1 A4),
    // the body encoding changed underneath us.
    expect(new URLSearchParams({ subject: "미정" }).toString()).toBe("subject=%EB%AF%B8%EC%A0%95");
  });
});
