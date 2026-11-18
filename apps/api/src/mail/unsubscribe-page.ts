import type { AppLocale } from '@skladnik/shared';
import { escapeHtml } from './mail-layout';

type PageKind = 'confirm' | 'done' | 'invalid';

const COPY: Record<
  AppLocale,
  Record<PageKind, { title: string; body: string; button?: string; note?: string }>
> = {
  en: {
    confirm: {
      title: 'Unsubscribe from Oborotix tips',
      body: 'Confirm to stop marketing emails such as the first-scan reminder. Account emails (trial status, security) will still be sent.',
      button: 'Confirm unsubscribe',
    },
    done: {
      title: 'You are unsubscribed',
      body: 'You will no longer receive Oborotix marketing tip emails. You can still use the product and receive account notices.',
    },
    invalid: {
      title: 'This unsubscribe link is not valid',
      body: 'The link may be incomplete or altered. If you still receive tip emails, reply to the message or contact Oborotix support.',
    },
  },
  bg: {
    confirm: {
      title: 'Отписване от съветите на Oborotix',
      body: 'Потвърдете, за да спрете маркетинговите имейли (например напомнянето за първо сканиране). Имейлите за акаунта (пробен период, сигурност) ще продължат.',
      button: 'Потвърдете отписването',
    },
    done: {
      title: 'Отписани сте',
      body: 'Вече няма да получавате маркетингови съвети от Oborotix. Можете да ползвате продукта и да получавате известия за акаунта.',
    },
    invalid: {
      title: 'Връзката за отписване не е валидна',
      body: 'Връзката може да е непълна или променена. Ако все още получавате съвети, отговорете на писмото или се свържете с Oborotix.',
    },
  },
};

export function renderUnsubscribePage(input: {
  kind: PageKind;
  locale: AppLocale;
  token?: string;
  postAction: string;
}): string {
  const copy = COPY[input.locale][input.kind];
  const button =
    input.kind === 'confirm' && input.token && copy.button
      ? `<form method="POST" action="${escapeHtml(input.postAction)}" style="margin:24px 0 0;">
           <input type="hidden" name="token" value="${escapeHtml(input.token)}" />
           <button type="submit" style="background:#0d9488;color:#fff;border:0;border-radius:10px;padding:12px 18px;font-size:15px;font-weight:600;cursor:pointer;">
             ${escapeHtml(copy.button)}
           </button>
         </form>`
      : '';

  return `<!DOCTYPE html>
<html lang="${input.locale}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(copy.title)} · Oborotix</title>
</head>
<body style="margin:0;padding:32px 16px;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:28px;">
    <div style="font-size:13px;font-weight:600;color:#0d9488;margin-bottom:10px;">Oborotix</div>
    <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;">${escapeHtml(copy.title)}</h1>
    <p style="margin:0;font-size:15px;line-height:1.6;color:#334155;">${escapeHtml(copy.body)}</p>
    ${button}
  </div>
</body>
</html>`;
}
