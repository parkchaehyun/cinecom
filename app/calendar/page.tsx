import Link from "next/link";
import CalendarSubscription from "@/components/CalendarSubscription";

export const metadata = {
  title: "캘린더 구독 · 씨네꼼 상영실 예약",
  description: "씨네꼼 상영실 예약 현황을 외부 캘린더에서 읽기 전용으로 구독합니다.",
};

const body = {
  color: "var(--ink-muted)",
  font: `500 var(--text-sm)/1.75 var(--font-sans)`,
  wordBreak: "keep-all",
} as const;

export default function CalendarPage() {
  return (
    <div style={{ minHeight: "100dvh", background: "var(--page)", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "20px 12px" }}>
      <main style={{ width: "100%", maxWidth: 560, boxSizing: "border-box", background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r-xl)", boxShadow: "var(--shadow-card)", padding: "28px 22px 32px" }}>
        <Link href="/" style={{ color: "var(--accent-ink)", font: `600 var(--text-xs) var(--font-sans)`, textDecoration: "none" }}>
          ← 예약 현황으로
        </Link>

        <h1 style={{ margin: "14px 0 8px", color: "var(--ink)", font: `700 var(--text-xl)/1.3 var(--font-sans)`, letterSpacing: "-0.02em" }}>
          상영실 예약 캘린더
        </h1>
        <p style={{ ...body, margin: "0 0 22px" }}>
          대상영실·소상영실 예약을 Apple 캘린더, Google 캘린더, Outlook 같은 외부 앱에서 함께 볼 수 있습니다.
        </p>

        <section style={{ marginBottom: 26, padding: "16px", border: "1px solid var(--line)", borderRadius: "var(--r-md)", background: "var(--surface)" }} aria-label="캘린더 구독">
          <CalendarSubscription />
        </section>

        <HelpSection title="어떻게 동기화되나요?">
          <p style={{ ...body, margin: 0 }}>
            이 주소는 파일을 한 번 가져오는 방식이 아니라 계속 연결되는 구독 주소입니다. 씨네꼼 예약 현황이 바뀌면 외부 캘린더 앱이 다음에 새로고침할 때 수정·삭제된 일정도 반영됩니다. 앱마다 확인 주기가 달라 반영까지 시간이 걸릴 수 있습니다.
          </p>
        </HelpSection>

        <HelpSection title="앱별 추가 방법">
          <ol style={{ ...body, margin: 0, paddingLeft: 20 }}>
            <li style={{ marginBottom: 7 }}>
              <strong style={{ color: "var(--ink)" }}>Apple 캘린더</strong>: 위의 &lsquo;캘린더 앱에서 구독&rsquo;을 누릅니다. 열리지 않으면 구독 주소를 복사한 뒤 &lsquo;구독 캘린더 추가&rsquo;에 붙여 넣습니다.
            </li>
            <li style={{ marginBottom: 7 }}>
              <strong style={{ color: "var(--ink)" }}>Google 캘린더</strong>: 컴퓨터 웹에서 &lsquo;다른 캘린더 + → URL로 추가&rsquo;를 열고 복사한 주소를 붙여 넣습니다.
            </li>
            <li>
              <strong style={{ color: "var(--ink)" }}>Outlook</strong>: &lsquo;캘린더 추가 → 웹에서 구독&rsquo;에 복사한 주소를 붙여 넣습니다.
            </li>
          </ol>
        </HelpSection>

        <HelpSection title="읽기 전용">
          <p style={{ ...body, margin: 0 }}>
            구독한 일정은 외부 앱에서 읽기 전용입니다. 예약을 수정하거나 취소하려면 각 일정의 카페 원글 링크에서 변경해 주세요. 모든 예약은 개인 일정의 참석 여부와 무관하게 표시되므로, 개인의 바쁨 상태에는 영향을 주지 않습니다.
          </p>
          <p style={{ ...body, margin: "7px 0 0" }}>
            외부 캘린더에는 상영실, 시간, 영화 제목, 상태와 원글 링크만 표시하며 작성자 별명은 보내지 않습니다.
          </p>
        </HelpSection>
      </main>
    </div>
  );
}

function HelpSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 24 }}>
      <h2 style={{ margin: "0 0 7px", color: "var(--ink)", font: `700 var(--text-base)/1.4 var(--font-sans)` }}>{title}</h2>
      {children}
    </section>
  );
}
