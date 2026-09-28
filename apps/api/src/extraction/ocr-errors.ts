export function isVisionQuotaError(message: string) {
  const text = message.toLowerCase();
  return (
    text.includes('1113') ||
    text.includes('insufficient balance') ||
    text.includes('no resource package') ||
    text.includes('please recharge')
  );
}

export function isVisionOverloadError(message: string) {
  const text = message.toLowerCase();
  return text.includes('1305') || text.includes('overloaded') || text.includes('try again later');
}

export function isVisionRateLimitError(message: string) {
  const text = message.toLowerCase();
  return text.includes('1302') || text.includes('rate limit');
}

export function isVisionTransientError(message: string) {
  const text = message.toLowerCase();
  return (
    isVisionOverloadError(message) ||
    isVisionRateLimitError(message) ||
    text.includes('fetch failed') ||
    text.includes('network') ||
    text.includes('timeout') ||
    text.includes('operation was aborted') ||
    text.includes('econnreset') ||
    text.includes('did not return valid json')
  );
}

export function isUnrecoverableVisionError(message: string) {
  const text = message.toLowerCase();
  return (
    isVisionQuotaError(message) ||
    text.includes('api key is not configured') ||
    text.includes('unauthorized') ||
    text.includes('invalid api key')
  );
}
