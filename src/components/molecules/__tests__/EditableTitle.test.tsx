import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EditableTitle from '@/components/molecules/EditableTitle';

describe('EditableTitle', () => {
  it('renders the value as a button in display mode', () => {
    render(<EditableTitle value="Weekly Shop" onSave={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Rename: Weekly Shop' })).toBeInTheDocument();
  });

  it('reveals an input seeded with the value when clicked', () => {
    render(<EditableTitle value="Weekly Shop" onSave={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rename: Weekly Shop' }));
    expect(screen.getByRole('textbox', { name: 'List name' })).toHaveValue('Weekly Shop');
  });

  it('uses the provided ariaLabel on the input', () => {
    render(<EditableTitle value="Weekly Shop" onSave={vi.fn()} ariaLabel="List title" />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('textbox', { name: 'List title' })).toBeInTheDocument();
  });

  it('commits a trimmed new value on Enter and returns to display mode', () => {
    const onSave = vi.fn();
    render(<EditableTitle value="Weekly Shop" onSave={onSave} />);
    fireEvent.click(screen.getByRole('button'));
    const input = screen.getByRole('textbox', { name: 'List name' });
    fireEvent.change(input, { target: { value: '  Costco Run  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSave).toHaveBeenCalledWith('Costco Run');
    expect(screen.getByRole('button', { name: 'Rename: Weekly Shop' })).toBeInTheDocument();
  });

  it('commits on blur', () => {
    const onSave = vi.fn();
    render(<EditableTitle value="Weekly Shop" onSave={onSave} />);
    fireEvent.click(screen.getByRole('button'));
    const input = screen.getByRole('textbox', { name: 'List name' });
    fireEvent.change(input, { target: { value: 'Costco Run' } });
    fireEvent.blur(input);
    expect(onSave).toHaveBeenCalledWith('Costco Run');
  });

  it('does not call onSave and restores the value on Escape', () => {
    const onSave = vi.fn();
    render(<EditableTitle value="Weekly Shop" onSave={onSave} />);
    fireEvent.click(screen.getByRole('button'));
    const input = screen.getByRole('textbox', { name: 'List name' });
    fireEvent.change(input, { target: { value: 'Discarded' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Rename: Weekly Shop' })).toBeInTheDocument();
  });

  it('does not call onSave when the value is unchanged', () => {
    const onSave = vi.fn();
    render(<EditableTitle value="Weekly Shop" onSave={onSave} />);
    fireEvent.click(screen.getByRole('button'));
    const input = screen.getByRole('textbox', { name: 'List name' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('does not call onSave when the value is whitespace only', () => {
    const onSave = vi.fn();
    render(<EditableTitle value="Weekly Shop" onSave={onSave} />);
    fireEvent.click(screen.getByRole('button'));
    const input = screen.getByRole('textbox', { name: 'List name' });
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSave).not.toHaveBeenCalled();
  });
});
