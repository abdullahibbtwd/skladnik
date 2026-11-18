import type { AppLocale } from '@skladnik/shared';

export type WelcomeCopy = {
  subject: string;
  preheader: string;
  heading: string;
  greeting: (name: string) => string;
  trialLine: (date: string) => string;
  stepsHeading: string;
  /** Short getting-started bullets derived from help-en / help-bg. */
  steps: [string, string, string];
  ctaLabel: string;
  helpLabel: string;
  helpHint: string;
  footnote: string;
};

const EN: WelcomeCopy = {
  subject: 'Welcome to Oborotix — your 14-day trial is active',
  preheader: 'Your trial is live. Scan your first supplier invoice to update stock.',
  heading: 'Welcome to Oborotix',
  greeting: (name) => `Hi ${name},`,
  trialLine: (date) => `Your 14-day trial is active until ${date}.`,
  stepsHeading: 'Getting started',
  steps: [
    'Choose your site, then open Photograph invoice (or Scan on mobile).',
    'Take a clear photo of a supplier delivery note and wait for the lines to appear.',
    'Check matches, then post the document so stock and expiry alerts update.',
  ],
  ctaLabel: 'Scan your first invoice',
  helpLabel: 'Open the help guide',
  helpHint: 'Step-by-step tasks for your role are in Help inside the app.',
  footnote: 'You are receiving this because you created an Oborotix store account.',
};

/**
 * BG copy — needs native review (machine-assisted draft from help-bg wording).
 * Do not treat as final marketing Bulgarian until a native speaker edits it.
 */
const BG: WelcomeCopy = {
  subject: 'Добре дошли в Oborotix — 14-дневният пробен период е активен',
  preheader: 'Пробният период е активен. Сканирайте първата доставна бележка, за да обновите склада.',
  heading: 'Добре дошли в Oborotix',
  greeting: (name) => `Здравейте, ${name},`,
  trialLine: (date) => `Вашият 14-дневен пробен период е активен до ${date}.`,
  stepsHeading: 'Първи стъпки',
  steps: [
    'Изберете обект и отворете „Фотографирай фактура“ (или Scan на мобилен).',
    'Направете ясна снимка на доставната бележка и изчакайте редовете да се появят.',
    'Проверете съвпаденията и осчетоводете документа, за да се обновят складът и сроковете.',
  ],
  ctaLabel: 'Сканирайте първата фактура',
  helpLabel: 'Отворете помощния наръчник',
  helpHint: 'Стъпките по роли са в Помощ вътре в приложението.',
  footnote: 'Получавате това писмо, защото създадохте акаунт за магазин в Oborotix.',
};

export function welcomeCopyForLocale(locale: AppLocale): WelcomeCopy {
  return locale === 'bg' ? BG : EN;
}
