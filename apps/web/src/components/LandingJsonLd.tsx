import React from 'react';
import { useTranslation } from 'react-i18next';
import { SITE_ORIGIN } from '../lib/landing-seo';

/**
 * SoftwareApplication JSON-LD for the public landing (facts from existing copy only).
 * No invented ratings, prices, or review counts.
 */
export const LandingJsonLd: React.FC = () => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('bg') ? 'bg' : 'en';

  const data = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Oborotix',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: lang === 'bg' ? `${SITE_ORIGIN}/bg` : `${SITE_ORIGIN}/`,
    description: t('auth.homeDescription'),
    inLanguage: lang === 'bg' ? 'bg-BG' : 'en-GB',
    // 14-day Starter trial with no card (existing pricing copy). No invented list price.
    isAccessibleForFree: true,
    offers: {
      '@type': 'Offer',
      description: t('pricing.subtitle'),
    },
  };

  return (
    <script
      type="application/ld+json"
      // JSON-LD must be raw text in the document for crawlers / prerender.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
};
