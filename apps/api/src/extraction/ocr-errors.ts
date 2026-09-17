export function isUnrecoverableVisionError(message: string) {
  const text = message.toLowerCase();
  return (
    text.includes('insufficient balance') ||
    text.includes('no resource package') ||
    text.includes('please recharge') ||
    text.includes('api key is not configured') ||
    text.includes('unauthorized') ||
    text.includes('invalid api key')
  );
}
