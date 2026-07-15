import BookingBoard from "@/components/BookingBoard";
import { auth } from "@/auth";
import { addDays, buildDates, mondayOf, todayKST } from "@/lib/dates";
import { fetchBoards } from "@/lib/naver";
import { getSlots } from "@/lib/slots";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth().catch(() => null); // login isn't configured yet in dev
  const today = todayKST();
  // Start at last week's Monday so the week view always has a full Mon–Sun, and run a month ahead.
  const from = addDays(mondayOf(today), -7);
  const to = addDays(today, 30);

  // Boards come from the cafe's own menu (cached an hour) — the 소모임 list is rewritten yearly.
  const [slots, boards] = await Promise.all([getSlots(from, to), fetchBoards()]);
  const dates = buildDates(from, to);
  const initialIdx = Math.max(0, dates.findIndex((d) => d.date === today));

  return (
    <BookingBoard
      slots={slots}
      dates={dates}
      today={today}
      initialIdx={initialIdx}
      loggedIn={!!session?.accessToken && !session.error}
      userName={session?.user?.name ?? null}
      boards={boards}
    />
  );
}
