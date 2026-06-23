import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ItemEntryForm from '@/components/molecules/ItemEntryForm';

describe('ItemEntryForm', () => {
  it('renders input associated to sr-only label via inputId', () => {
    render(
      <ItemEntryForm
        value=""
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        placeholder="Add an item…"
        inputId="test-input"
      />,
    );
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('id', 'test-input');
    const label = document.querySelector('label[for="test-input"]') as HTMLElement;
    expect(label).not.toBeNull();
    expect(label.className).toMatch(/sr-only/);
  });

  it('disables the Add button when value is empty', () => {
    render(
      <ItemEntryForm
        value=""
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        placeholder="Add an item…"
        inputId="test-input"
      />,
    );
    expect(screen.getByRole('button', { name: /add/i })).toBeDisabled();
  });

  it('enables the Add button when value is non-empty', () => {
    render(
      <ItemEntryForm
        value="milk"
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        placeholder="Add an item…"
        inputId="test-input"
      />,
    );
    expect(screen.getByRole('button', { name: /add/i })).toBeEnabled();
  });

  it('disables the Add button when value is whitespace only', () => {
    render(
      <ItemEntryForm
        value="   "
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        placeholder="Add an item…"
        inputId="test-input"
      />,
    );
    expect(screen.getByRole('button', { name: /add/i })).toBeDisabled();
  });

  it('calls onChange when typing in the input', () => {
    const onChange = vi.fn();
    render(
      <ItemEntryForm
        value=""
        onChange={onChange}
        onSubmit={vi.fn()}
        placeholder="Add an item…"
        inputId="test-input"
      />,
    );
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'eggs' } });
    expect(onChange).toHaveBeenCalledWith('eggs');
  });

  it('calls onSubmit when the Add button is clicked', () => {
    const onSubmit = vi.fn();
    render(
      <ItemEntryForm
        value="eggs"
        onChange={vi.fn()}
        onSubmit={onSubmit}
        placeholder="Add an item…"
        inputId="test-input"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /add/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('calls onSubmit when Enter is pressed in the input', () => {
    const onSubmit = vi.fn();
    render(
      <ItemEntryForm
        value="eggs"
        onChange={vi.fn()}
        onSubmit={onSubmit}
        placeholder="Add an item…"
        inputId="test-input"
      />,
    );
    fireEvent.submit(screen.getByRole('textbox').closest('form') as HTMLElement);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('respects explicit disabledSubmit prop', () => {
    render(
      <ItemEntryForm
        value="eggs"
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        placeholder="Add an item…"
        inputId="test-input"
        disabledSubmit={true}
      />,
    );
    expect(screen.getByRole('button', { name: /add/i })).toBeDisabled();
  });

  it('calls onBlur when the input loses focus', () => {
    const onBlur = vi.fn();
    render(
      <ItemEntryForm
        value="eggs"
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        placeholder="Add an item…"
        inputId="test-input"
        onBlur={onBlur}
      />,
    );
    fireEvent.blur(screen.getByRole('textbox'));
    expect(onBlur).toHaveBeenCalledTimes(1);
  });
});
