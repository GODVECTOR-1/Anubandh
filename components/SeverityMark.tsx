import { SEVERITY } from '@/lib/presentation';
import { SEVERITY_TEXT, type Locale } from '@/lib/i18n';
import type { Severity } from '@/contracts/schema';
import { cn } from '@/lib/cn';

/**
 * The severity marker: rule + icon + text label, always all three.
 *
 * There is no `showLabel` prop and there will not be one. The moment a caller
 * can turn the words off, colour becomes the only channel on some surface
 * nobody re-audits, and the accessibility guarantee quietly stops being true.
 */
export function SeverityMark({
  severity,
  className,
  locale = 'en',
}: {
  severity: Severity;
  className?: string;
  locale?: Locale;
}) {
  const s = SEVERITY[severity];
  const text = SEVERITY_TEXT[locale][severity];
  const Icon = s.icon;
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 text-xs font-medium tracking-wide', s.text, className)}
      lang={locale}
      title={text.meaning}
    >
      <Icon
        size={14}
        aria-hidden="true"
        strokeWidth={2}
        {...(s.iconFill ? { fill: 'currentColor', className: 'opacity-90' } : {})}
      />
      {text.label}
    </span>
  );
}

/** The left-edge rule. Decorative by itself — SeverityMark carries the meaning. */
export function SeverityRule({ severity }: { severity: Severity }) {
  return <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-[3px] rounded-l-lg', SEVERITY[severity].rule)} />;
}
