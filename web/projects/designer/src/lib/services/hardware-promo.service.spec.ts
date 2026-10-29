import { ConfigService } from './config.service';
import { HardwarePromoService } from './hardware-promo.service';

// The hint towards the Rocket Show hardware: never on a device, and for a returning visitor only.
describe('HardwarePromoService', () => {
  const keys = ['hardwarePromoSessions', 'hardwarePromoLastVisit', 'hardwarePromoBarDismissed'];
  let configService: ConfigService;
  let now: number;

  function clearStorage() {
    for (const key of keys) {
      localStorage.removeItem(key);
    }
  }

  beforeEach(() => {
    clearStorage();
    configService = new ConfigService();
    configService.hardwarePromo = true;
    now = 1_000_000_000_000;
    spyOn(Date, 'now').and.callFake(() => now);
  });

  afterEach(clearStorage);

  it('shows nothing on a Rocket Show device', () => {
    configService.hardwarePromo = false;
    localStorage.setItem('hardwarePromoSessions', '5');
    const service = new HardwarePromoService(configService);

    service.countSession();

    expect(service.enabled).toBe(false);
    expect(service.showBar).toBe(false);
    expect(localStorage.getItem('hardwarePromoLastVisit')).toBeNull();
  });

  it('shows the hint from the second visit on, reloads within half an hour counting as one', () => {
    let service = new HardwarePromoService(configService);
    service.countSession();
    expect(service.showBar).toBe(false);

    now += 29 * 60 * 1000;
    service = new HardwarePromoService(configService);
    service.countSession();
    expect(service.showBar).toBe(false);

    // half an hour after the last reload, it is a visit of its own
    now += 31 * 60 * 1000;
    service = new HardwarePromoService(configService);
    service.countSession();
    expect(service.showBar).toBe(true);
    expect(localStorage.getItem('hardwarePromoSessions')).toBe('2');
  });

  it('stops showing the hint for good once it is dismissed', () => {
    localStorage.setItem('hardwarePromoSessions', '3');
    const service = new HardwarePromoService(configService);
    expect(service.showBar).toBe(true);

    service.dismissBar();

    expect(service.showBar).toBe(false);
    expect(new HardwarePromoService(configService).showBar).toBe(false);
  });

  it('tags the link to the hardware with where it was clicked', () => {
    const service = new HardwarePromoService(configService);

    expect(service.link('preview bar')).toBe(
      'https://rocketshow.net/products?utm_source=designer&utm_medium=app&utm_campaign=hardware&utm_content=preview%20bar'
    );
  });
});
