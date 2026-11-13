import { HttpErrorResponse } from '@angular/common/http';

import { getForwardingErrorKey } from './api-error';

// What the user is told when a Rocket Show device couldn't forward a request to the online designer
describe('getForwardingErrorKey', () => {
  it('names a device which can not reach the online designer, or gave up waiting for it', () => {
    expect(getForwardingErrorKey(new HttpErrorResponse({ status: 502, error: { error: 'api-unreachable' } }))).toBe(
      'designer.device.api-unreachable'
    );
    expect(getForwardingErrorKey(new HttpErrorResponse({ status: 504, error: { error: 'api-timeout' } }))).toBe(
      'designer.device.api-timeout'
    );
  });

  it('leaves the other errors to the one asking', () => {
    expect(getForwardingErrorKey(new HttpErrorResponse({ status: 503, error: { error: 'ai-busy' } }))).toBeUndefined();
    expect(getForwardingErrorKey(new HttpErrorResponse({ status: 504, error: 'Gateway Timeout' }))).toBeUndefined();
    expect(getForwardingErrorKey(undefined)).toBeUndefined();
  });
});
