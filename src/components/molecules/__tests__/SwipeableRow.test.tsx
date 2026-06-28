import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SwipeableRow from '@/components/molecules/SwipeableRow';

function renderRow(onDelete = vi.fn(), onToggle = vi.fn()) {
  render(
    <ul>
      <SwipeableRow onDelete={onDelete} deleteLabel="Delete Milk">
        <div onClick={onToggle}>Milk</div>
      </SwipeableRow>
    </ul>,
  );
  const content = screen.getByText('Milk');
  const foreground = content.parentElement as HTMLElement;
  return { onDelete, onToggle, content, foreground };
}

const down = { clientX: 200, clientY: 100, pointerId: 1, pointerType: 'touch' };

describe('SwipeableRow', () => {
  it('a swipe past the threshold fires onDelete', () => {
    const { onDelete, foreground } = renderRow();
    fireEvent.pointerDown(foreground, down);
    fireEvent.pointerMove(foreground, { ...down, clientX: 40 }); // 160px left
    fireEvent.pointerUp(foreground, { ...down, clientX: 40 });
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('a partial swipe below the threshold snaps back without deleting', () => {
    const { onDelete, foreground } = renderRow();
    fireEvent.pointerDown(foreground, down);
    fireEvent.pointerMove(foreground, { ...down, clientX: 170 }); // 30px left
    fireEvent.pointerUp(foreground, { ...down, clientX: 170 });
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('suppresses the row tap (onToggle) after a swipe drag', () => {
    const { onToggle, content, foreground } = renderRow();
    fireEvent.pointerDown(foreground, down);
    fireEvent.pointerMove(foreground, { ...down, clientX: 150 }); // 50px left → a drag
    fireEvent.pointerUp(foreground, { ...down, clientX: 150 });
    fireEvent.click(content);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('does not suppress a tap (movement under the slop) — onToggle still fires', () => {
    const { onToggle, content, foreground } = renderRow();
    fireEvent.pointerDown(foreground, down);
    fireEvent.pointerMove(foreground, { ...down, clientX: 197 }); // 3px → a tap
    fireEvent.pointerUp(foreground, { ...down, clientX: 197 });
    fireEvent.click(content);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('exposes an accessible delete button that fires onDelete', () => {
    const { onDelete } = renderRow();
    fireEvent.click(screen.getByRole('button', { name: /delete milk/i }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('animates the foreground only under motion-safe (respects reduced motion)', () => {
    const { foreground } = renderRow();
    expect(foreground.className).toContain('motion-safe:transition-transform');
  });
});
