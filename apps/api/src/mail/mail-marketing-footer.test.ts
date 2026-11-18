/**
 * Marketing unsubscribe footer helpers (EU soft-opt-in / non-transactional mails).
 */
import assert from 'node:assert/strict';
import {
  marketingUnsubscribeFooterHtml,
  marketingUnsubscribeMailto,
  marketingUnsubscribeTextLine,
  renderMailHtml,
} from './mail-layout';

const mailto = marketingUnsubscribeMailto('oborotix@oborotix.com');
assert.ok(mailto.startsWith('mailto:oborotix@oborotix.com?'));
assert.ok(mailto.includes('Unsubscribe'));

const enFooter = marketingUnsubscribeFooterHtml({ locale: 'en', unsubscribeUrl: mailto });
assert.ok(enFooter.includes('Unsubscribe'));
assert.ok(enFooter.includes('mailto:'));

const bgFooter = marketingUnsubscribeFooterHtml({ locale: 'bg', unsubscribeUrl: mailto });
assert.ok(bgFooter.includes('Отпишете се'));

assert.ok(marketingUnsubscribeTextLine({ locale: 'en', unsubscribeUrl: mailto }).startsWith('Unsubscribe:'));

const html = renderMailHtml({
  preheader: 'pre',
  heading: 'Hello',
  bodyHtml: '<p>Body</p>',
  siteUrl: 'https://oborotix.com',
  marketingFooterHtml: enFooter,
});
assert.ok(html.includes('Unsubscribe'));
assert.ok(html.includes('mailto:oborotix@oborotix.com'));

const transactional = renderMailHtml({
  preheader: 'pre',
  heading: 'Hello',
  bodyHtml: '<p>Body</p>',
  siteUrl: 'https://oborotix.com',
});
assert.equal(transactional.includes('Unsubscribe'), false);

// Trial/lifecycle transactional templates must not ship marketing unsubscribe chrome.
assert.equal(transactional.includes('List-Unsubscribe'), false);

console.log('mail-marketing-footer.test.ts: ok');
