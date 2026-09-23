/**
 * A gavel, drawn rather than imported.
 *
 * lucide ships a Gavel icon and it is used elsewhere at 12-16px, where a stroke
 * icon is exactly right. At mark size a stroke icon reads thin and pasted on, so
 * this is built from filled shapes in the same ink and navy the rest of the page
 * uses, with the same top-edge rim light every other raised surface carries. It
 * is the design language, not a sticker on top of it.
 *
 * Decorative: `aria-hidden`. The headline beside it already says what the
 * product is, and a screen reader announcing "gavel" adds nothing a reader of
 * that headline does not have.
 *
 * On what it promises: a gavel is a judge ruling, and this product does not
 * predict rulings. It sits beside the eyebrow as a domain mark, at mark scale,
 * and deliberately not in the hero's image slot — the clause card holds that,
 * because the clause card is the actual claim.
 */
export function GavelMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      aria-hidden="true"
      focusable="false"
      role="presentation"
    >
      {/* sound block: the striking block the gavel lands on */}
      <rect x="9" y="50" width="46" height="7" rx="2.5" fill="var(--ink)" opacity="0.88" />
      <rect x="9" y="50" width="46" height="1.6" rx="0.8" fill="var(--rim)" opacity="0.5" />
      <rect x="15" y="45.5" width="34" height="4.5" rx="1.6" fill="var(--ink-muted)" />

      {/* the gavel itself, raised off the block */}
      <g transform="rotate(-34 32 26)">
        {/* handle */}
        <rect x="29.4" y="24" width="5.2" height="22" rx="2.6" fill="var(--ink-muted)" />
        <rect x="29.4" y="41" width="5.2" height="5" rx="2.4" fill="var(--ink)" />

        {/* head */}
        <rect x="13" y="11" width="38" height="15" rx="4.5" fill="var(--ink)" />
        {/* rim light along the top edge, same as every raised surface */}
        <rect x="14.5" y="11.6" width="35" height="1.7" rx="0.85" fill="var(--rim)" opacity="0.55" />

        {/* the two bands, in the authority navy the statutory tags use */}
        <rect x="17.5" y="11" width="3.2" height="15" fill="var(--statutory)" />
        <rect x="43.3" y="11" width="3.2" height="15" fill="var(--statutory)" />
      </g>
    </svg>
  );
}
