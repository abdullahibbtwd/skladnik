/**
 * Unit checks for signup locale whitelist (shared parseAppLocale).
 */
import assert from 'node:assert/strict';
import { DEFAULT_APP_LOCALE, parseAppLocale } from '@skladnik/shared';

assert.equal(parseAppLocale('en'), 'en');
assert.equal(parseAppLocale('bg'), 'bg');
assert.equal(parseAppLocale('BG'), 'bg');
assert.equal(parseAppLocale('bg-BG'), 'bg');
assert.equal(parseAppLocale('fr'), DEFAULT_APP_LOCALE);
assert.equal(parseAppLocale(undefined), DEFAULT_APP_LOCALE);
assert.equal(parseAppLocale(null), DEFAULT_APP_LOCALE);

console.log('parse-locale.test.ts: ok');
