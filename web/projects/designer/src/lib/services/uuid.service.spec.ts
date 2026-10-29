import { UuidService } from './uuid.service';

describe('UuidService', () => {
  it('makes random uuids of version 4', () => {
    const service = new UuidService();
    const uuids = new Set<string>();

    for (let i = 0; i < 100; i++) {
      const uuid = service.getUuid();
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      uuids.add(uuid);
    }

    expect(uuids.size).toBe(100);
  });
});
