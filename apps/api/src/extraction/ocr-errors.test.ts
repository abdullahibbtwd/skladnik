import { isUnrecoverableVisionError, isVisionOverloadError, isVisionQuotaError, isVisionRateLimitError, isVisionTransientError } from './ocr-errors';

if (!isVisionQuotaError('1113: Insufficient balance or no resource package. Please recharge.')) {
  throw new Error('quota 1113 should match');
}
if (isVisionQuotaError('1305: The service may be temporarily overloaded, please try again later')) {
  throw new Error('overload should not look like quota');
}
if (!isVisionOverloadError('1305: The service may be temporarily overloaded, please try again later')) {
  throw new Error('overload 1305 should match');
}
if (!isUnrecoverableVisionError('GLM/Z.AI API key is not configured')) {
  throw new Error('missing key should be unrecoverable');
}
if (isUnrecoverableVisionError('1305: overloaded')) {
  throw new Error('overload should be retryable');
}
if (!isVisionTransientError('fetch failed')) {
  throw new Error('fetch failed should be retried');
}
if (!isVisionTransientError('Model did not return valid JSON')) {
  throw new Error('invalid json should be retried');
}
if (!isVisionRateLimitError('1302: Rate limit reached for requests') || !isVisionTransientError('1302: Rate limit reached for requests')) {
  throw new Error('rate limit should be retried');
}
if (!isVisionTransientError('The operation was aborted due to timeout')) {
  throw new Error('request timeout should be retried');
}
if (isVisionTransientError('current transaction is aborted, commands ignored until end of transaction block')) {
  throw new Error('database transaction errors are not vision outages');
}

console.log('ocr-errors tests passed');
