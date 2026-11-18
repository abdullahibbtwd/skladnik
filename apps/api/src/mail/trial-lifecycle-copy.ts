import type { AppLocale } from '@skladnik/shared';

export type TrialLifecycleCopy = {
  subject: string;
  preheader: string;
  heading: string;
  greeting: (name: string) => string;
  body: string;
  ctaLabel: string;
  footnote: string;
};

const ENDING_EN: TrialLifecycleCopy = {
  subject: '3 days left on your Oborotix trial',
  preheader: 'Your Starter trial ends soon. Activate a plan to keep writing stock.',
  heading: '3 days left on your trial',
  greeting: (name) => `Hi ${name},`,
  body: 'Your 14-day Oborotix trial ends in about 3 days. After that the account becomes read-only until you apply an activation code. You can still view and export data.',
  ctaLabel: 'Open subscription settings',
  footnote: 'You are receiving this because your store is on an Oborotix trial.',
};

const ENDING_BG: TrialLifecycleCopy = {
  subject: 'Остават 3 дни от пробния период в Oborotix',
  preheader: 'Пробният период на Starter приключва скоро. Активирайте план, за да продължите да записвате.',
  heading: 'Остават 3 дни от пробния период',
  greeting: (name) => `Здравейте, ${name},`,
  body: 'Вашият 14-дневен пробен период в Oborotix приключва след около 3 дни. След това акаунтът става само за четене, докато не приложите код за активиране. Можете все още да преглеждате и експортирате данни.',
  ctaLabel: 'Отворете настройките за абонамент',
  footnote: 'Получавате това писмо, защото магазинът ви е на пробен период в Oborotix.',
};

const ENDED_EN: TrialLifecycleCopy = {
  subject: 'Your Oborotix trial has ended',
  preheader: 'Your data is safe. Request an activation code to keep editing.',
  heading: 'Your trial has ended',
  greeting: (name) => `Hi ${name},`,
  body: 'Your Oborotix trial has ended. Your data is safe — the account is read-only. To keep adding or editing, request an activation code from Oborotix.',
  ctaLabel: 'Request a quote',
  footnote: 'You are receiving this because your Oborotix trial ended.',
};

const ENDED_BG: TrialLifecycleCopy = {
  subject: 'Пробният период в Oborotix приключи',
  preheader: 'Данните ви са в безопасност. Поискайте код за активиране, за да продължите да редактирате.',
  heading: 'Пробният период приключи',
  greeting: (name) => `Здравейте, ${name},`,
  body: 'Пробният период в Oborotix приключи. Данните ви са в безопасност — акаунтът е само за четене. За да продължите да добавяте или редактирате, поискайте код за активиране от Oborotix.',
  ctaLabel: 'Поискайте оферта',
  footnote: 'Получавате това писмо, защото пробният период в Oborotix приключи.',
};

export function trialEndingCopyForLocale(locale: AppLocale): TrialLifecycleCopy {
  return locale === 'bg' ? ENDING_BG : ENDING_EN;
}

export function trialEndedCopyForLocale(locale: AppLocale): TrialLifecycleCopy {
  return locale === 'bg' ? ENDED_BG : ENDED_EN;
}
