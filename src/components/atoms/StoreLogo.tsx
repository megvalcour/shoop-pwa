import { useState } from 'react';

interface Props {
  slug: string;
  name: string;
  sizeClassName?: string;
}

export default function StoreLogo({ slug, name, sizeClassName = 'h-9 w-9' }: Props) {
  const [hidden, setHidden] = useState(false);

  if (hidden) return null;

  return (
    <img
      src={`/store-logos/${slug}.png`}
      alt={name}
      onError={() => setHidden(true)}
      className={`${sizeClassName} rounded-full bg-white object-contain p-1 shadow-md`}
    />
  );
}
