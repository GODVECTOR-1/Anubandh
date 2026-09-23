'use client';

import { Component, type ReactNode } from 'react';
import { CardStub } from '@/components/CardStub';
import { useLocale } from '@/components/LocaleProvider';
import type { Locale } from '@/lib/i18n';

/**
 * A card that silently fails to render is indistinguishable from "no flag
 * here" — which re-creates, at card granularity, the exact failure the
 * three-end-states rule exists to prevent: an empty Radar reads as "this is
 * fine."
 *
 * So a boundary failure renders a VISIBLE stub, and the coverage header already
 * counts it, so the number and the visible cards never disagree.
 */
class CardBoundaryInner extends Component<
  { children: ReactNode; label: string; locale: Locale },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed
      ? <CardStub label={this.props.label} locale={this.props.locale} />
      : this.props.children;
  }
}

/** The class needs the locale as a prop; hooks cannot run inside one. */
export function CardBoundary({ children, label }: { children: ReactNode; label: string }) {
  return (
    <CardBoundaryInner label={label} locale={useLocale()}>
      {children}
    </CardBoundaryInner>
  );
}
