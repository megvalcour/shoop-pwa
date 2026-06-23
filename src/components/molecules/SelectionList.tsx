import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck } from '@fortawesome/free-solid-svg-icons';

export interface SelectionListProps<T> {
  items: T[];
  getKey: (item: T) => string;
  isSelected: (item: T) => boolean;
  renderLabel: (item: T) => React.ReactNode;
  onSelect: (item: T) => void;
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
      {items.map((item) => {
        const selected = isSelected(item);
        return (
          <li key={getKey(item)}>
            <button
              className={`w-full flex items-center justify-between px-4 py-3 text-left ${
                selected ? 'text-primary font-semibold' : 'text-text'
              }`}
              onClick={() => onSelect(item)}
            >
              <span>{renderLabel(item)}</span>
              {selected && <FontAwesomeIcon icon={faCheck} className="text-primary" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
