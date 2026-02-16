import { TestBed } from '@angular/core/testing';

import { FixturePixelGroupResolveService } from './fixture-pixel-group-resolve.service';

describe('FixturePixelGroupResolveService', () => {
  let service: FixturePixelGroupResolveService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(FixturePixelGroupResolveService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
