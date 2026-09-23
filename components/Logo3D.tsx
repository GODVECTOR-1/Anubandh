/**
 * The Anubandh mark, extruded.
 *
 * Real 3D, not a drop shadow pretending: the glyph is stacked in depth layers
 * inside a `preserve-3d` context, so the side of the letter is genuinely
 * visible as it turns and the extrusion foreshortens correctly at the edges.
 *
 * Built in CSS rather than WebGL on purpose. The Spline runtime already costs
 * 769 KB on desktop, and spending a second 3D engine on a logo would be the
 * most expensive possible way to render one letter. This is a few hundred bytes
 * and renders on a phone.
 *
 * The glyph is अ — the first letter of अनुबंध, the product's own name in its own
 * script. A gavel would have been the obvious choice and the wrong one: a gavel
 * means a judge ruling, and this product's whole promise is that it will not
 * predict one.
 *
 * Decorative, so `aria-hidden`: the wordmark sits beside it and already says the
 * name. Under prefers-reduced-motion it holds still at a fixed angle rather than
 * rotating — the depth survives, the movement does not.
 */

const DEPTH = 14;

export function Logo3D({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={className} style={{ perspective: '900px' }}>
      <div className="anb-logo3d relative h-full w-full">
        {Array.from({ length: DEPTH }, (_, i) => {
          // 2.4px per layer, not 1.6: at the shallower spacing the extrusion
          // only read at the extremes of the sweep and looked flat through
          // the middle of it.
          const z = -i * 2.4;
          // Back layers darken toward the navy the statutory tags use, so the
          // extrusion reads as a material with a side, not as a blur.
          const t = i / (DEPTH - 1);
          return (
            <span
              key={i}
              className="absolute inset-0 flex items-center justify-center font-semibold leading-none"
              style={{
                transform: `translateZ(${z}px)`,
                color: i === 0 ? 'var(--ink)' : 'var(--statutory)',
                // A hairline of page colour on the front face only, so the
                // leading edge catches light the way every other raised
                // surface here does.
                textShadow: i === 0 ? '0 1px 0 var(--rim)' : 'none',
                opacity: i === 0 ? 1 : 0.28 + (1 - t) * 0.45,
                fontSize: '1em',
              }}
            >
              अ
            </span>
          );
        })}
      </div>
    </div>
  );
}
