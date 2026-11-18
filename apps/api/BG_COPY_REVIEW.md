# Bulgarian copy review pack

Export for a single native review pass. Mark edits inline and return.

**Status:** lifecycle emails gated by `LIFECYCLE_EMAILS_ENABLED=false` until this review lands.

## 1. Live-facing web (priority)

### FAQ (`bg.json` → `faq`)
```json
{
  "badge": "Пробен период и активиране",
  "title": "Чести въпроси преди старт",
  "subtitle": "Как работят 14-дневният пробен период на Starter и кодовете за активиране.",
  "trialQ": "Колко дълъг е безплатният пробен период?",
  "trialA": "Новите акаунти получават 14-дневен пробен период на Starter. През него можете да сканирате доставки, да следите наличността и да продавате.",
  "cardQ": "Трябва ли ми карта, за да започна?",
  "cardA": "Не е нужна карта за старт. Цената се уговаря с Oborotix, когато изберете план.",
  "afterTrialQ": "Какво се случва след 14-тия ден?",
  "afterTrialA": "След 14-дневния пробен период акаунтът става само за четене. Можете все още да преглеждате и експортирате данни. За да продължите да добавяте или редактирате, поискайте код за активиране.",
  "activationQ": "Как работи активирането?",
  "activationA": "Кодовете за активиране се издават от Oborotix след пробния период. Поставете еднократния код в приложението, за да отключите плана според броя обекти и потребители."
}
```

### Quote form (`bg.json` → `quote`)
```json
{
  "badge": "Поискайте оферта",
  "title": "Разкажете ни за обектите си",
  "subtitle": "Цената се уговаря с Oborotix. Оставете няколко детайла и ще се свържем — без карта.",
  "name": "Вашето име",
  "businessType": "Вид бизнес",
  "businessTypePlaceholder": "Хранителен магазин, кафе, пекарна…",
  "locations": "Брой обекти",
  "contact": "Имейл или телефон",
  "message": "Допълнително? (по желание)",
  "submit": "Поискайте оферта",
  "submitting": "Изпращане…",
  "successTitle": "Заявката е получена",
  "successBody": "Благодарим — скоро ще се свържем с вас за цената според вашите обекти.",
  "errorGeneric": "Заявката не можа да се изпрати. Опитайте отново.",
  "honeypotLabel": "Уебсайт"
}
```

### Pricing snippets (`bg.json` → `pricing`)
```json
{
  "subtitle": "Започнете 14-дневен пробен период на Starter, после изберете план според броя обекти и потребители. Цената се уговаря с Oborotix — без карта за старт.",
  "footnote": "Кодовете за активиране се издават от Oborotix след пробния период.",
  "getQuoteLink": "Не сте сигурни кой план? Поискайте оферта",
  "startTrial": "Започнете 14-дневен пробен период"
}
```

## 2. Email — welcome (transactional, already approved?)

Source: `apps/api/src/mail/welcome-copy.ts` (BG object). Review if anything drifted.

## 3. Email — first-scan nudge (marketing)

Source: `apps/api/src/mail/first-scan-nudge-copy.ts`

```
const BG: FirstScanNudgeCopy = {
  subject: 'Сканирайте първата фактура — около 20 секунди',
  preheader: 'Пробният период в Oborotix ви чака. Снимайте доставна бележка, за да обновите склада.',
  heading: 'Сканирайте първата фактура',
  greeting: (name) => `Здравейте, ${name},`,
  body: 'Сканирайте първата фактура — отнема около 20 секунди. Насочете телефона към доставната бележка и Oborotix попълва редовете за проверка и осчетоводяване.',
  ctaLabel: 'Отворете Oborotix',
  footnote: 'Получавате това писмо, защото създадохте акаунт за магазин в Oborotix и все още не сте сканирали фактура.',
};

```

## 4. Email — trial ending / ended (transactional, informational)

Source: `apps/api/src/mail/trial-lifecycle-copy.ts`

```
const ENDING_BG: TrialLifecycleCopy = {
  subject: 'Остават 3 дни от пробния период в Oborotix',
  preheader: 'Пробният период на Starter приключва скоро. Активирайте план, за да продължите да записвате.',
  heading: 'Остават 3 дни от пробния период',
  greeting: (name) => `Здравейте, ${name},`,
  body: 'Вашият 14-дневен пробен период в Oborotix приключва след около 3 дни. След това акаунтът става само за четене, докато не приложите код за активиране. Можете все още да преглеждате и експортирате данни.',
  ctaLabel: 'Отворете настройките за абонамент',
  footnote: 'Получавате това писмо, защото магазинът ви е на пробен период в Oborotix.',
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

```

## 5. Unsubscribe confirmation pages

Source: `apps/api/src/mail/unsubscribe-page.ts` (bg key)

```
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
           <button type="submit" style="background:#0d9488;color:#fff;
```

## Review checklist

- [ ] FAQ
- [ ] Quote form
- [ ] Pricing snippets
- [ ] Welcome (spot-check)
- [ ] First-scan nudge
- [ ] Trial ending
- [ ] Trial ended
- [ ] Unsubscribe pages
- [ ] After fixes: set `LIFECYCLE_EMAILS_ENABLED=true` in production
