// The errors of a Rocket Show device forwarding a request to the API of the online designer (the AI, the votes, an
// offer of a profile): it can't reach the API, or it gave up waiting for its answer. The key of the translation of
// what to tell the user, or undefined for another error.
export function getForwardingErrorKey(error: any): string {
  const code = error?.error?.error;

  return code === 'api-unreachable' || code === 'api-timeout' ? 'designer.device.' + code : undefined;
}
