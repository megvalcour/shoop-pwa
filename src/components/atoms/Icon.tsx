import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { FontAwesomeIconProps } from '@fortawesome/react-fontawesome';

export type IconProps = FontAwesomeIconProps;

export default function Icon(props: IconProps) {
  return <FontAwesomeIcon {...props} />;
}
