import { describe, expect, it } from "vitest";
import { cafeArticleAndroidIntentUrl, cafeArticleWebUrl } from "./cafe-link";

describe("Naver Cafe article links", () => {
  it("keeps a normal HTTPS article URL as the permanent fallback", () => {
    expect(cafeArticleWebUrl(12345)).toBe("https://cafe.naver.com/cinecom/12345");
  });

  it("gives Android the Cafe package and an encoded web fallback", () => {
    expect(cafeArticleAndroidIntentUrl(12345)).toBe(
      "intent://cafe/26859626/12345#Intent;scheme=navercafe;package=com.nhn.android.navercafe;S.browser_fallback_url=https%3A%2F%2Fcafe.naver.com%2Fcinecom%2F12345;end",
    );
  });
});
