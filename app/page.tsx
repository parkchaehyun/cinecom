import BookingBoard from "@/components/BookingBoard";
import { addDays, buildDates, mondayOf, todayKST } from "@/lib/dates";
import { getSlots } from "@/lib/slots";

export const dynamic = "force-dynamic";

export default async function Home() {
  const today = todayKST();
  // Start at last week's Monday so the week view always has a full Mon–Sun, and run a month ahead.
  const from = addDays(mondayOf(today), -7);
  const to = addDays(today, 30);

  const [slots, dates] = [await getSlots(from, to), buildDates(from, to)];
  const initialIdx = Math.max(0, dates.findIndex((d) => d.date === today));

  return <BookingBoard slots={slots} dates={dates} today={today} initialIdx={initialIdx} />;
}
