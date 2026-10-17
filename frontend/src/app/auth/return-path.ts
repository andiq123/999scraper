/** Only return to known app screens, never to an external or authentication URL. */
export function returnPath(value: string | null | undefined): string {
  return value && /^\/(?:[?#]|$|(?:saved|history|alerts|account)(?:[?#]|$))/.test(value) && !/[\\\r\n]/.test(value)
    ? value
    : '/';
}
