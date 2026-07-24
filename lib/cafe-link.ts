const CAFE_ID = 26859626;
const CAFE_URL = "cinecom";
const ANDROID_PACKAGE = "com.nhn.android.navercafe";

export function cafeArticleWebUrl(articleId: number): string {
  return `https://cafe.naver.com/${CAFE_URL}/${articleId}`;
}

export function cafeArticleAndroidIntentUrl(articleId: number): string {
  const fallback = encodeURIComponent(cafeArticleWebUrl(articleId));
  return `intent://cafe/${CAFE_ID}/${articleId}#Intent;scheme=navercafe;package=${ANDROID_PACKAGE};S.browser_fallback_url=${fallback};end`;
}
