import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck } from '@fortawesome/free-solid-svg-icons';

export interface SelectionListProps<T> {
  items: T[];
  getKey: (item: T, index: number) => string;
  isSelected: (item: T, index: number) => boolean;
  renderLabel: (item: T, index: number) => React.ReactNode;
  onSelect: (item: T, index: number) => void;
  /**
   * Optional trailing control rendered as a *sibling* of the toggle button —
   * outside the selection target — so an interactive accessory (e.g. an input)
   * is valid HTML and its clicks never toggle the row.
   */
  renderAccessory?: (item: T, index: number) => React.ReactNode;
}

export default function SelectionList<T>({
  items,
  getKey,
  isSelected,
  renderLabel,
  onSelect,
  renderAccessory,
}: SelectionListProps<T>) {
  return (
    <ul>
      {items.map((item, index) => {
        const selected = isSelected(item, index);
        const accessory = renderAccessory?.(item, index);
        return (
          <li key={getKey(item, index)} className="flex items-center">
            <button
              className={`flex-1 min-w-0 flex items-center justify-between px-4 py-3 text-left ${
                selected ? 'text-primary font-semibold' : 'text-text'
              }`}
              onClick={() => onSelect(item, index)}
            >
              <span>{renderLabel(item, index)}</span>
              {selected && <FontAwesomeIcon icon={faCheck} className="text-primary" />}
            </button>
            {accessory !== undefined && accessory !== null && (
              <div className="shrink-0 pr-4">{accessory}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
