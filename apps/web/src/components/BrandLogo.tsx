import React from 'react';
import { cn } from '../lib/cn';

type BrandLogoVariant = 'full' | 'mark' | 'white';

type BrandLogoProps = {
  variant?: BrandLogoVariant;
  /** Applied to the img; use height utilities (e.g. h-8) for sizing. */
  className?: string;
  alt?: string;
};

const SRC: Record<BrandLogoVariant, string> = {
  full: '/oborotix-logo.png',
  mark: '/oborotix-favicon.png',
  white: '/oborotix-logo-white.png',
};

/** Oborotix mark or wordmark. Prefer `full` / `white` alone — they already include the name. */
export const BrandLogo: React.FC<BrandLogoProps> = ({
  variant = 'full',
  className,
  alt = 'Oborotix',
}) => (
  <img
    src={SRC[variant]}
    alt={alt}
    decoding="async"
    className={cn(
      variant === 'mark' ? 'size-8 object-contain' : 'h-8 w-auto object-contain object-left',
      className,
    )}
  />
);
