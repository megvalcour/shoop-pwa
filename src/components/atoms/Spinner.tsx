import { faSpinner } from '@fortawesome/free-solid-svg-icons';
import Icon from '@/components/atoms/Icon';

interface SpinnerProps {
  className?: string;
  'aria-label'?: string;
}

/**
 * Small inline spinner sized to sit in a badge slot. A status indicator, not an
 * action — built on the `Icon` atom + FontAwesome `faSpinner` (ADR-0007).
 */
export default function Spinner({ className, 'aria-label': ariaLabel = 'Loading' }: SpinnerProps) {
  return (
    <Icon icon={faSpinner} className={`animate-spin ${className ?? ''}`} role="status" aria-label={ariaLabel} />
  );
}
