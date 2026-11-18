import React from 'react';
import { cn } from '../lib/cn';

type BrandLogoVariant = 'full' | 'mark' | 'white';

type BrandLogoProps = {
  variant?: BrandLogoVariant;
  /** Applied to the img; use height utilities (e.g. h-8) for sizing. */
  className?: string;
  alt?: string;
};

const SRC: Record<BrandLogoVariant, { webp: string; png: string }> = {
  full: { webp: '/oborotix-logo.webp', png: '/oborotix-logo.png' },
  mark: { webp: '/oborotix-favicon.webp', png: '/oborotix-favicon.png' },
  white: { webp: '/oborotix-logo-white.webp', png: '/oborotix-logo-white.png' },
};

/** Oborotix mark or wordmark. Prefer `full` / `white` alone — they already include the name. */
export const BrandLogo: React.FC<BrandLogoProps> = ({
  variant = 'full',
  className,
  alt = 'Oborotix',
}) => {
  const src = SRC[variant];
  const imgClass = cn(
    variant === 'mark' ? 'size-8 object-contain' : 'h-8 w-auto object-contain object-left',
    className,
  );
  return (
    <picture>
      <source srcSet={src.webp} type="image/webp" />
      <img src={src.png} alt={alt} decoding="async" className={imgClass} />
    </picture>
  );
};
