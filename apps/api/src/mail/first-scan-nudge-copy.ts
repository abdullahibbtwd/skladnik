import type { AppLocale } from '@skladnik/shared';

export type FirstScanNudgeCopy = {
  subject: string;
  preheader: string;
  heading: string;
  greeting: (name: string) => string;
  body: string;
  ctaLabel: string;
  footnote: string;
};

const EN: FirstScanNudgeCopy = {
  subject: 'Scan your first invoice — about 20 seconds',
  preheader: 'Your Oborotix trial is waiting. Photograph a supplier invoice to update stock.',
  heading: 'Scan your first invoice',
  greeting: (name) => `Hi ${name},`,
  body: 'Scan your first invoice — it takes about 20 seconds. Point your phone at a supplier delivery note and Oborotix fills the lines for you to check and post.',
  ctaLabel: 'Open Oborotix',
  footnote: 'You are receiving this because you created an Oborotix store account and have not scanned an invoice yet.',
};

const BG: FirstScanNudgeCopy = {
  subject: 'Сканирайте първата фактура — около 20 секунди',
  preheader: 'Пробният период в Oborotix ви чака. Снимайте доставна бележка, за да обновите склада.',
  heading: 'Сканирайте първата фактура',
  greeting: (name) => `Здравейте, ${name},`,
  body: 'Сканирайте първата фактура — отнема около 20 секунди. Насочете телефона към доставната бележка и Oborotix попълва редовете за проверка и осчетоводяване.',
  ctaLabel: 'Отворете Oborotix',
  footnote: 'Получавате това писмо, защото създадохте акаунт за магазин в Oborotix и все още не сте сканирали фактура.',
};

export function firstScanNudgeCopyForLocale(locale: AppLocale): FirstScanNudgeCopy {
  return locale === 'bg' ? BG : EN;
}
