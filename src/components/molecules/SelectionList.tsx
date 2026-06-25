import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck } from '@fortawesome/free-solid-svg-icons';

export interface SelectionListProps<T> {
  items: T[];
  getKey: (item: T, index: number) => string;
  isSelected: (item: T, index: number) => boolean;
  renderLabel: (item: T, index: number) => React.ReactNode;
  onSelect: (item: T, index: number) => void;
}

export default function SelectionList<T>({
  items,
  getKey,
  isSelected,
  renderLabel,
  onSelect,
}: SelectionListProps<T>) {
  return (
    <ul>
      {items.map((item, index) => {
        const selected = isSelected(item, index);
        return (
          <li key={getKey(item, index)}>
            <button
              className={`w-full flex items-center justify-between px-4 py-3 text-left ${
                selected ? 'text-primary font-semibold' : 'text-text'
              }`}
              onClick={() => onSelect(item, index)}
            >
              <span>{renderLabel(item, index)}</span>
              {selected && <FontAwesomeIcon icon={faCheck} className="text-primary" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
