import Button from '@/components/atoms/Button';
import Input from '@/components/atoms/Input';

export interface ItemEntryFormProps {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  placeholder: string;
  inputId: string;
  inputRef?: React.Ref<HTMLInputElement>;
  onBlur?: () => void;
  disabledSubmit?: boolean;
}

export default function ItemEntryForm({
  value,
  onChange,
  onSubmit,
  placeholder,
  inputId,
  inputRef,
  onBlur,
  disabledSubmit,
}: ItemEntryFormProps) {
  const isDisabled = disabledSubmit ?? !value.trim();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit();
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 mt-4">
      <label htmlFor={inputId} className="sr-only">
        Item name
      </label>
      <Input
        ref={inputRef}
        id={inputId}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        className="flex-1"
      />
      <Button type="submit" variant="primary" disabled={isDisabled}>
        Add
      </Button>
    </form>
  );
}
