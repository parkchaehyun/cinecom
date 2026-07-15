import { dayInfo } from "./dates";

const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

export interface TitleInput {
  date: string; // YYYY-MM-DD (KST)
  room: string;
  startMin: number;
  endMin: number;
  movie?: string | null;
  person?: string | null;
}

/**
 * The canonical reservation-post title.
 *
 *   `M월 D일 {요일} / {방} / HH:MM - HH:MM[ / {이름}] / {영화}`
 *
 * Shape is taken from what the club actually posts (2-yr corpus, board 13, 907 posts):
 * full 요일 (83%), dash separator (75%), HH:MM (99%). The name segment is dropped when
 * blank — the majority of real posts omit it — and an empty movie becomes 미정, as members do.
 */
export function buildTitle({ date, room, startMin, endMin, movie, person }: TitleInput): string {
  const d = dayInfo(date);
  const name = person?.trim();
  const film = movie?.trim() || "미정";
  return (
    `${d.md} ${d.wd} / ${room} / ${fmt(startMin)} - ${fmt(endMin)}` +
    (name ? ` / ${name}` : "") +
    ` / ${film}`
  );
}
