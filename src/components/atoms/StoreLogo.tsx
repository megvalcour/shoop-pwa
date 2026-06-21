import { useState } from 'react';

interface Props {
  slug: string;
  name: string;
}

export default function StoreLogo({ slug, name }: Props) {
  const [hidden, setHidden] = useState(false);

  if (hidden) return null;

  return (
    <img
      src={`/store-logos/${slug}.png`}
      alt={name}
      onError={() => setHidden(true)}
      className="h-9 w-9 rounded-full bg-white object-contain p-1 shadow-md"
    />
  );
}
