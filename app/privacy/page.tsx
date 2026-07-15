import Link from "next/link";

export const metadata = {
  title: "개인정보처리방침 · 씨네꼼 상영실 예약",
  description: "씨네꼼 상영실 예약 서비스의 개인정보처리방침",
};

const UPDATED = "2026년 7월 16일";

export default function Privacy() {
  return (
    <div style={{ minHeight: "100dvh", background: "var(--page)", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "20px 12px" }}>
      {/* alignItems:flex-start so the card is exactly as tall as its text — no more, no less. */}
      <main style={{ width: "100%", maxWidth: 680, background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r-xl)", boxShadow: "var(--shadow-card)", padding: "28px 22px 32px" }}>
        <Link href="/" style={{ font: `600 var(--text-xs) var(--font-sans)`, color: "var(--accent-ink)", textDecoration: "none" }}>
          ← 예약 현황으로
        </Link>

        <h1 style={{ font: `700 var(--text-xl)/1.3 var(--font-sans)`, letterSpacing: "-0.02em", margin: "14px 0 6px" }}>개인정보처리방침</h1>
        <p style={{ font: `500 var(--text-xs) var(--font-sans)`, color: "var(--ink-faint)", margin: "0 0 22px" }}>시행일: {UPDATED}</p>

        {/* The honest summary first. The sections below are what 개인정보보호법 제30조 requires;
            this is what a member actually wants to know, and it happens to be short. */}
        <p style={{ font: `500 var(--text-sm)/1.75 var(--font-sans)`, color: "var(--ink)", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--r-md)", padding: "14px 16px", margin: "0 0 26px", wordBreak: "keep-all" }}>
          씨네꼼 상영실 예약(이하 &lsquo;서비스&rsquo;)은 회원가입을 받지 않으며, 네이버 로그인으로부터 어떠한 개인정보도
          제공받거나 저장하지 않습니다. 서비스가 저장하는 정보는 씨네꼼 카페에 이미 공개된 예약글의 제목과 작성자
          별명뿐이며, 이는 예약 현황을 보여주기 위한 것으로 상영일로부터 90일이 지나면 자동으로 삭제됩니다. 원글이
          카페에서 삭제되면 서비스의 사본도 즉시 삭제됩니다.
        </p>

        <S n="1" t="개인정보의 처리 목적">
          <p>서비스는 다음의 목적으로만 개인정보를 처리하며, 목적 외의 용도로는 이용하지 않습니다.</p>
          <ul>
            <li>
              상영실 예약 현황 표시: 씨네꼼 카페에 공개된 예약글을 수집·분석하여 대상영실·소상영실의 예약 현황을
              시간표로 보여줍니다.
            </li>
            <li>
              예약글 작성: 이용자 본인 명의로 씨네꼼 카페에 예약글을 작성합니다. 네이버 로그인은 이 권한을 얻기
              위해서만 사용합니다.
            </li>
          </ul>
        </S>

        <S n="2" t="처리하는 개인정보의 항목">
          <h3>가. 네이버 로그인</h3>
          <p>
            서비스는 네이버 로그인에서 이용자 식별자 외의 제공 정보(회원이름, 연락처 이메일 주소, 별명, 프로필 사진,
            성별, 생일, 연령대, 출생연도, 휴대전화번호)를 일체 조회하지 않습니다. 이용자 식별자는 네이버가 기본
            정보로 제공하나 서비스는 이를 저장하지 않습니다. 서비스에는 회원 계정이나 회원 데이터베이스가 존재하지
            않습니다.
          </p>
          <p>
            네이버 로그인 시 요청하는 &lsquo;카페&rsquo; 권한은 개인정보 조회 권한이 아니라, 이용자가 직접 예약글을
            작성하기 위하여 필요한 쓰기 권한입니다.
          </p>
          <h3>나. 씨네꼼 카페의 공개 게시글</h3>
          <p>
            서비스는 씨네꼼 카페(cafe.naver.com/cinecom)에 이미 공개되어 있는 예약글에서 다음 항목을 수집합니다.
            예약글이 아닌 게시글은 수집하지 않습니다.
          </p>
          <ul>
            <li>게시글 번호, 게시판 이름, 게시글 제목, 작성 일시</li>
            <li>작성자 별명(카페 닉네임): 예약 현황에 예약자를 표시하기 위하여 수집합니다.</li>
            <li>게시글 제목에서 추출한 상영실, 날짜, 시간, 영화 제목 및 제목에 이름이 기재된 경우 그 이름</li>
          </ul>
        </S>

        <S n="3" t="개인정보의 처리 및 보유 기간">
          <ul>
            <li>상영일로부터 90일이 지난 예약글 정보는 자동으로 삭제됩니다.</li>
            <li>원글이 카페에서 삭제된 경우, 서비스가 이를 확인하는 즉시(최대 10분 이내) 해당 정보를 삭제합니다.</li>
            <li>네이버 로그인으로 제공받아 보유하는 개인정보가 없으므로, 이에 대한 보유 기간도 존재하지 않습니다.</li>
          </ul>
        </S>

        <S n="4" t="개인정보의 제3자 제공">
          <p>
            서비스는 이용자의 개인정보를 제3자에게 제공하지 않습니다. 다만 이용자가 서비스에서 예약글 작성을 요청하는
            경우, 이용자 본인의 의사에 따라 이용자 본인 명의로 네이버 카페에 게시글이 작성됩니다.
          </p>
        </S>

        <S n="5" t="개인정보 처리업무의 위탁">
          {/* Focusable region: if this table ever overflows on a narrow phone, a keyboard user has
              to be able to scroll it. Without tabIndex the content is simply unreachable for them. */}
          <div tabIndex={0} role="region" aria-label="개인정보 처리업무 위탁 현황" className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>수탁업체</th>
                  <th>위탁업무</th>
                  <th>보관 위치</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Supabase, Inc.</td>
                  <td>데이터베이스 운영</td>
                  <td>대한민국 서울 (AWS ap-northeast-2)</td>
                </tr>
                <tr>
                  <td>Vercel, Inc.</td>
                  <td>웹 서비스 호스팅</td>
                  <td>대한민국 서울 (icn1)</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>서비스가 처리하는 개인정보는 대한민국 내에서만 저장·처리되며, 국외로 이전되지 않습니다.</p>
        </S>

        <S n="6" t="정보주체의 권리·의무 및 행사방법">
          <p>정보주체는 언제든지 다음의 권리를 행사할 수 있습니다.</p>
          <ul>
            <li>개인정보 열람, 정정, 삭제 및 처리정지 요구</li>
            <li>
              서비스가 표시하는 정보는 카페의 원글에서 수집한 것이므로, 카페에서 해당 글을 수정하거나 삭제하면
              서비스의 정보도 함께 수정·삭제됩니다.
            </li>
            <li>그 밖의 요구는 제10항의 연락처로 접수하며, 지체 없이 조치합니다.</li>
          </ul>
        </S>

        <S n="7" t="개인정보의 파기">
          <p>
            보유 기간이 지나거나 처리 목적이 달성된 개인정보는 지체 없이 파기합니다. 파기는 자동화된 절차에 따라
            데이터베이스에서 해당 기록을 복구할 수 없는 방법으로 영구 삭제하는 방식으로 이루어집니다.
          </p>
        </S>

        <S n="8" t="개인정보의 안전성 확보조치">
          <ul>
            <li>수집 항목의 최소화: 예약글이 아닌 게시글과 네이버 로그인의 제공 정보는 수집하지 않습니다.</li>
            <li>전송 구간 암호화(HTTPS) 적용 및 데이터베이스 접근 권한 통제</li>
            <li>보유 기간 경과 시 자동 파기</li>
          </ul>
        </S>

        <S n="9" t="개인정보 자동 수집 장치의 설치·운영 및 거부">
          <p>
            서비스는 예약 현황 조회에 쿠키를 사용하지 않으며, 로그인 없이 모든 예약 현황을 열람할 수 있습니다.
            이용자가 네이버 로그인을 한 경우에 한하여, 로그인 상태 유지를 위한 세션 쿠키 1개를 저장합니다. 이 쿠키에는
            카페 글쓰기에 필요한 인증 토큰이 담기며 최대 30일 후 만료되고, 로그아웃 시 즉시 삭제됩니다. 브라우저
            설정에서 쿠키를 거부할 수 있으나, 이 경우 예약글 작성 기능은 이용할 수 없습니다.
          </p>
        </S>

        <S n="10" t="개인정보 보호책임자 및 열람청구">
          <p>
            개인정보 처리에 관한 업무를 총괄해서 책임지고, 개인정보 처리와 관련한 정보주체의 문의, 불만처리 및
            피해구제 등에 관한 사항을 다음의 연락처로 접수·처리하고 있습니다.
          </p>
          <ul>
            <li>개인정보 보호업무 담당: 씨네꼼 상영실 예약 운영</li>
            <li>
              연락처: <a href="mailto:cinecom@chaepark.com">cinecom@chaepark.com</a>
            </li>
          </ul>
        </S>

        <S n="11" t="권익침해 구제방법">
          <p>개인정보 침해로 인한 구제를 받기 위하여 아래 기관에 분쟁해결이나 상담 등을 신청할 수 있습니다.</p>
          <ul>
            <li>개인정보분쟁조정위원회: 1833-6972 (www.kopico.go.kr)</li>
            <li>개인정보침해신고센터: 118 (privacy.kisa.or.kr)</li>
            <li>대검찰청 사이버수사과: 1301 (www.spo.go.kr)</li>
            <li>경찰청 사이버수사국: 182 (ecrm.police.go.kr)</li>
          </ul>
        </S>

        <S n="12" t="개인정보처리방침의 변경">
          <p>
            이 개인정보처리방침은 {UPDATED}부터 적용됩니다. 내용의 추가, 삭제 및 수정이 있을 경우 시행 7일 전부터 이
            페이지를 통해 고지합니다.
          </p>
        </S>
      </main>
    </div>
  );
}

/** A numbered section. Styles live here rather than on every element inside it. */
function S({ n, t, children }: { n: string; t: string; children: React.ReactNode }) {
  return (
    <section className="policy" style={{ marginBottom: 26 }}>
      <h2 style={{ font: `700 var(--text-base)/1.4 var(--font-sans)`, margin: "0 0 8px", color: "var(--ink)" }}>
        {n}. {t}
      </h2>
      {children}
    </section>
  );
}
