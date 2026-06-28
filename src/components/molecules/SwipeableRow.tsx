import { useRef, useState } from 'react';
import { faTrash } from '@fortawesome/free-solid-svg-icons';
import Icon from '@/components/atoms/Icon';

interface SwipeableRowProps {
  children: React.ReactNode;
  /** Dismiss the row — fired by a swipe past the threshold or the delete button. */
  onDelete: () => void;
  /** Accessible label for the (swipe-revealed) delete control. */
  deleteLabel?: string;
}

/** How far the row rests open at, in px — also the delete affordance's width. */
const REVEAL = 88;
/** Movement under this (px) is treated as a tap, not a drag. */
const TAP_SLOP = 8;
/** Swipe past this many px on release → delete. */
const DELETE_THRESHOLD = 120;

/**
 * Hand-rolled swipe-left-to-delete wrapper (Pointer Events, no dependency).
 * The foreground translates to reveal a destructive delete affordance beneath
 * it; releasing past {@link DELETE_THRESHOLD} fires `onDelete`, otherwise the
 * row snaps back. A swipe is not accessible on its own, so the revealed control
 * is a real focusable button (keyboard focus reveals it; Enter/Space deletes).
 */
export default function SwipeableRow({
  children,
  onDelete,
  deleteLabel = 'Delete item',
}: SwipeableRowProps) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef({ x: 0, y: 0 });
  const pointerId = useRef<number | null>(null);
  const axis = useRef<'idle' | 'horizontal' | 'vertical'>('idle');
  // True once a pointer sequence has moved enough to count as a horizontal
  // drag; used to suppress the child's tap (check-off) on release.
  const dragged = useRef(false);

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0 && e.pointerType === 'mouse') return; // primary button only
    start.current = { x: e.clientX, y: e.clientY };
    pointerId.current = e.pointerId;
    axis.current = 'idle';
    dragged.current = false;
    setDragging(true);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (pointerId.current !== e.pointerId) return;
    const moveX = e.clientX - start.current.x;
    const moveY = e.clientY - start.current.y;

    if (axis.current === 'idle') {
      if (Math.abs(moveX) < TAP_SLOP && Math.abs(moveY) < TAP_SLOP) return;
      // Lock to the dominant axis on the first meaningful movement so a
      // vertical scroll is never hijacked into a swipe.
      axis.current = Math.abs(moveX) > Math.abs(moveY) ? 'horizontal' : 'vertical';
      if (axis.current === 'horizontal') {
        e.currentTarget.setPointerCapture?.(e.pointerId);
      }
    }

    if (axis.current !== 'horizontal') return; // leave vertical scrolling alone

    dragged.current = true;
    // Reveal only on a left-swipe; clamp rightward to 0 and add a little
    // resistance past the resting reveal.
    setDx(Math.max(Math.min(0, moveX), -(REVEAL + 48)));
  }

  function onPointerEnd(e: React.PointerEvent) {
    if (pointerId.current !== e.pointerId) return;
    pointerId.current = null;
    setDragging(false);
    const wasHorizontal = axis.current === 'horizontal';
    axis.current = 'idle';
    if (!wasHorizontal) {
      setDx(0);
      return;
    }
    if (-dx >= DELETE_THRESHOLD) {
      onDelete();
    }
    // Always settle closed; a partial swipe snaps back.
    setDx(0);
  }

  // Swallow the synthetic click that follows a drag so the row's check-off
  // (an onClick on the wrapped content) never fires after a swipe.
  function onClickCapture(e: React.MouseEvent) {
    if (dragged.current) {
      e.stopPropagation();
      e.preventDefault();
      dragged.current = false;
    }
  }

  const open = dx !== 0 || dragging;

  return (
    <li className={`relative rounded-xl ${open ? 'overflow-hidden' : ''}`}>
      {/* Delete affordance revealed beneath the row on a left-swipe. */}
      <div className="absolute inset-y-0 right-0 flex">
        <button
          type="button"
          aria-label={deleteLabel}
          onClick={onDelete}
          onFocus={() => setDx(-REVEAL)}
          onBlur={() => setDx(0)}
          style={{ width: REVEAL }}
          className="flex items-center justify-center bg-destructive text-primary-foreground motion-safe:transition-colors"
        >
          <Icon icon={faTrash} />
        </button>
      </div>
      {/* Foreground: the row content, translated to reveal the affordance. */}
      <div
        style={{ transform: `translateX(${dx}px)` }}
        className={`relative touch-pan-y ${
          dragging ? '' : 'motion-safe:transition-transform motion-safe:duration-200'
        }`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onClickCapture={onClickCapture}
      >
        {children}
      </div>
    </li>
  );
}
