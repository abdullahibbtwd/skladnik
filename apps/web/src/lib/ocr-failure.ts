import i18n from '../i18n';

export function ocrFailureCopy(raw: string | null | undefined) {
  const text = (raw ?? '').toLowerCase();
  const overload =
    text.includes('1305') ||
    text.includes('1302') ||
    text.includes('overloaded') ||
    text.includes('rate limit') ||
    text.includes('timeout') ||
    text.includes('aborted') ||
    text.includes('interrupted') ||
    text.includes('stalled') ||
    text.includes('try again later');
  const billing =
    text.includes('1113') ||
    text.includes('insufficient balance') ||
    text.includes('no resource package') ||
    text.includes('please recharge');
  const config =
    text.includes('api key is not configured') ||
    text.includes('unauthorized') ||
    text.includes('invalid api key');

  if (overload) {
    return {
      title: i18n.t('ocr.photoTitle'),
      what: i18n.t('ocr.busyWhat'),
      action: i18n.t('ocr.busyAction'),
      contactSupport: false,
      retryable: true,
    };
  }

  if (config) {
    return {
      title: i18n.t('ocr.billingTitle'),
      what: i18n.t('ocr.configWhat'),
      action: i18n.t('ocr.configAction'),
      contactSupport: true,
      retryable: false,
    };
  }

  if (billing) {
    return {
      title: i18n.t('ocr.billingTitle'),
      what: i18n.t('ocr.billingWhat'),
      action: i18n.t('ocr.billingAction'),
      contactSupport: true,
      retryable: true,
    };
  }

  return {
    title: i18n.t('ocr.photoTitle'),
    what: raw?.trim() || i18n.t('ocr.photoWhat'),
    action: i18n.t('ocr.photoAction'),
    contactSupport: true,
    retryable: true,
  };
}
