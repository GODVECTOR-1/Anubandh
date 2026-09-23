import { Fragment, type ReactNode } from 'react';

/**
 * Splices React nodes into a translated template.
 *
 * Needed because the animated counts sit INSIDE sentences, and the two
 * languages put them in different places: English says "37 of 41 obligations
 * verified", Hindi says "41 में से 37 बातें जाँची गईं". Concatenating a prefix
 * and a suffix would force one language's word order onto the other, so the
 * template carries named slots and the caller supplies what goes in them.
 */
export function interpolate(template: string, values: Record<string, ReactNode>): ReactNode[] {
  return template.split(/(\{[a-zA-Z]+\})/).map((part, i) => {
    const m = part.match(/^\{([a-zA-Z]+)\}$/);
    if (m && m[1] in values) return <Fragment key={i}>{values[m[1]]}</Fragment>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}
