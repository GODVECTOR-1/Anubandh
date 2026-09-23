import Image from 'next/image';

/**
 * The hero's background image.
 *
 * "Busy imagery behind text" is an instant-fail design rule, and the way an
 * image fails it is always the same: the reader's eye has to separate the words
 * from what is behind them. So the image is never allowed to be at full
 * strength where the text is.
 *
 * Four treatments do that, and they are not optional decoration:
 *
 *   bleed   the layer breaks out of the section's max-w-5xl column to the full
 *           viewport width. Inside the column it was not a background at all,
 *           it was a picture with two hard vertical edges sitting behind the
 *           copy, which reads as a mistake rather than as depth.
 *   scrim   a left-to-right wash of the page colour. Over the text column it is
 *           effectively opaque, so the measured contrast pairs still hold; past
 *           the copy it falls away and the image comes up.
 *   mask    the image fades out at the top and bottom edges instead of ending
 *           on a hard line, so it reads as part of the page rather than a
 *           rectangle someone pasted in.
 *   tone    slight desaturation and reduced contrast. A photograph competing at
 *           full saturation next to a Rs. 2,00,000 clause wins, and it should
 *           not.
 *
 * The scrim's stops are the whole design, and they are set against the layout
 * rather than guessed. The copy column ends around half the viewport, so the
 * page colour is held fully opaque to 19% and is still 83% at 47%. It clears by
 * 69%, which is past the content column's right edge, so the picture is
 * strongest in the outer margin and behind the clause card and weakest exactly
 * where the words are. That is also what makes the card's glass work at all:
 * glass over flat paper is just a lighter rectangle.
 *
 * Every number here was tuned against scripts/check-hero.ts rather than by eye.
 * The picture was asked to come up; the binding constraint turned out to be the
 * footnote low in the one-column hero (4.44:1 on a tablet at an earlier floor)
 * and the body paragraph on desktop (4.19:1 when the wash cleared at 66%).
 *
 * Unset HERO_IMAGE and nothing renders and nothing is fetched. The hero was
 * designed to read without it, so its absence is a plain page, not a hole.
 */
export function HeroBackdrop({ src }: { src: string | null }) {
  if (!src) return null;

  return (
    <div
      aria-hidden="true"
      // left-1/2 + w-screen + -translate-x-1/2 is the breakout. The section
      // carries overflow-x-clip so a 100vw width cannot introduce a horizontal
      // scrollbar, which would fail the mobile layout check.
      className="pointer-events-none absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2 overflow-hidden"
    >
      {/* Bottom fade only. The top used to fade too, which threw away the one
          band of the hero that has no text in it — and on a phone that band is
          the only place the picture can be strong. The top edge lands exactly
          on the header rule, so it reads as the image starting under the
          header rather than as a crop. */}
      <div className="absolute inset-0 [mask-image:linear-gradient(to_bottom,#000,#000_80%,transparent)]">
        <Image
          src={src}
          alt=""
          fill
          // The hero image is the largest thing above the fold, so it is the
          // LCP candidate: fetched eagerly rather than lazily, and sized so a
          // phone never downloads the desktop asset.
          priority
          sizes="100vw"
          // Framed on the subject, not on the centre of the file.
          //
          // The hero is far wider than it is tall on a desktop and far taller
          // than it is wide on a phone, so object-cover crops a different axis
          // at each end. 42% down holds the lit icon cluster and the head of
          // the agreement inside the frame in both cases; plain centring drops
          // the icons off the top of the wide crop.
          style={{ objectPosition: '50% 42%' }}
          className="object-cover opacity-[0.88] [filter:saturate(0.95)_contrast(1)]"
        />
      </div>

      {/* Two scrims, because the hero is two different shapes.

          Below lg the grid collapses to one column and the copy runs the full
          width, so there is no clear SIDE to give the picture — only a clear
          TOP. The wash runs vertically: open above the monogram, then clamped
          to 90% page colour by 72px down, which is above where the eyebrow
          starts at every width below lg.
          The stops are not taste. They are the output of compositing this
          photograph under the scrim and measuring the worst pixel behind every
          run of text in the hero, at four widths and both themes. See
          scripts/check-hero.ts.

          The stop is in PIXELS, not a percentage. A percentage is measured
          against the section height, which shrinks on a phone and dragged the
          clamp down below the eyebrow: 18% cleared it at 5.6:1 on a tablet and
          failed it at 3.85:1 at 375px.

          At lg the clause card takes the right half and the copy stops around
          47%, so the wash runs horizontally and can clear completely past 69%
          without a single word sitting over it. */}
      <div className="absolute inset-0 bg-gradient-to-b from-paper/10 via-paper/86 via-[72px] to-paper/84 lg:hidden" />
      <div className="absolute inset-0 hidden bg-gradient-to-r from-paper from-19% via-paper/83 via-47% to-transparent to-69% lg:block" />
      {/* Bottom landing only. This used to wash the top at 70% as well, which
          would now cancel the open band the mask and the small-screen scrim
          were just changed to create. */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-paper" />
    </div>
  );
}
