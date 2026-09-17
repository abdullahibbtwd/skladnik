import i18n from '../i18n';

export function ocrFailureCopy(raw: string | null | undefined) {
  const text = (raw ?? '').toLowerCase();
  const billing =
    text.includes('insufficient balance') ||
    text.includes('no resource package') ||
    text.includes('please recharge') ||
    text.includes('quota');
  const config =
    text.includes('api key is not configured') ||
    text.includes('unauthorized') ||
    text.includes('invalid api key');

  if (billing || config) {
    return {
      title: i18n.t('ocr.billingTitle'),
      what: i18n.t('ocr.billingWhat'),
      action: i18n.t('ocr.billingAction'),
      contactSupport: true,
      retryable: false,
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
