import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { NgxBootstrapSliderModule, SliderComponent } from 'ngx-bootstrap-slider';
import { ToastrModule } from 'ngx-toastr';

import { Fixture, Positioning } from '../../../models/fixture';
import { Project } from '../../../models/project';
import { FixtureService } from '../../../services/fixture.service';
import { PresetService } from '../../../services/preset.service';
import { PreviewService } from '../../../services/preview.service';
import { ProjectService } from '../../../services/project.service';
import { FixtureSettingsPositionComponent } from './fixture-settings-position.component';

// Where the fixtures picked in the settings hang: at one of the places of the stage, or
// placed and turned by hand. Whatever the picked fixtures share is shown, the rest is left
// open, and a change goes to all of them.
describe('FixtureSettingsPositionComponent', () => {
  let fixture: ComponentFixture<FixtureSettingsPositionComponent>;
  let fixtureService: FixtureService;
  let presetService: PresetService;
  let left: Fixture;
  let right: Fixture;
  let updates: number;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      declarations: [FixtureSettingsPositionComponent],
      imports: [FormsModule, NgxBootstrapSliderModule, TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });

    TestBed.inject(ProjectService).project = new Project();
    fixtureService = TestBed.inject(FixtureService);
    presetService = TestBed.inject(PresetService);

    updates = 0;
    TestBed.inject(PreviewService).doUpdateStageAndPositions.subscribe(() => updates++);

    left = new Fixture({ uuid: 'left', positioning: 'manual', positionX: -200, positionY: 100, positionZ: 50, rotationX: 90 });
    right = new Fixture({ uuid: 'right', positioning: 'manual', positionX: 200, positionY: 100, positionZ: 50, rotationY: 45 });

    fixture = TestBed.createComponent(FixtureSettingsPositionComponent);
    await update();
  });

  async function update() {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  // pick the fixtures to set up, the way the fixture panel does
  async function pick(...fixtures: Fixture[]) {
    fixtureService.selectedSettingsFixtures = fixtures;
    presetService.fixtureSelectionSettingsChanged.next();
    await update();
  }

  const select = (): HTMLSelectElement => fixture.nativeElement.querySelector('select');
  // the fields of the position (x, the depth and the height) and the rotation (x, y, z)
  const inputs = (): HTMLInputElement[] => Array.from(fixture.nativeElement.querySelectorAll('input.slider-input'));
  const sliders = (): any[] =>
    fixture.debugElement.queryAll(By.directive(SliderComponent)).map((slider) => slider.componentInstance.slider);

  async function type(input: HTMLInputElement, value: string) {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await update();
  }

  async function choose(value: string) {
    select().value = Array.from(select().options).find((option) => option.value === value || option.value.endsWith(': ' + value)).value;
    select().dispatchEvent(new Event('change'));
    await update();
  }

  it('asks to pick fixtures, while none is picked', () => {
    expect(select()).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('designer.fixture.no-fixtures-settings-selected');
  });

  it('shows where the picked fixtures hang, if they share it', async () => {
    left.positioning = Positioning.topBack;
    right.positioning = Positioning.topBack;

    await pick(left, right);

    expect(select().value).toBe('topBack');
    expect(inputs()).toEqual([]);

    right.positioning = Positioning.bottomFront;
    await pick(left, right);

    expect(select().selectedIndex).toBe(0);
  });

  it('hangs all picked fixtures at the place chosen', async () => {
    left.positioning = Positioning.topBack;
    await pick(left, right);

    await choose('bottomFront');

    expect(left.positioning).toBe(Positioning.bottomFront);
    expect(right.positioning).toBe(Positioning.bottomFront);
    expect(updates).toBe(1);
  });

  it('keeps the places of the fixtures, when the empty entry is chosen', async () => {
    left.positioning = Positioning.topBack;
    await pick(left, right);

    await choose('undefined');

    expect(left.positioning).toBe(Positioning.topBack);
    expect(right.positioning).toBe(Positioning.manual);
    expect(updates).toBe(0);
  });

  it('shows the position and the rotation the picked fixtures share, and leaves the others open', async () => {
    await pick(left, right);

    expect(select().value).toBe('manual');
    // x is not shared, the depth and the height are
    expect(inputs().map((input) => input.value)).toEqual(['', '50', '100', '', '', '0']);
  });

  it('leaves a value open, which only some of the fixtures have, even when the first one is at zero', async () => {
    left.positionX = 0;
    left.positionZ = 0;
    left.rotationY = 0;
    right.rotationZ = 10;

    await pick(left, right);

    expect(inputs().map((input) => input.value)).toEqual(['', '', '100', '', '', '']);

    await pick(right, left);

    expect(inputs().map((input) => input.value)).toEqual(['', '', '100', '', '', '']);
  });

  it('places all picked fixtures by hand', async () => {
    await pick(left, right);

    await type(inputs()[0], '120');
    await type(inputs()[1], '-30');
    await type(inputs()[2], '250');

    expect([left.positionX, left.positionZ, left.positionY]).toEqual([120, -30, 250]);
    expect([right.positionX, right.positionZ, right.positionY]).toEqual([120, -30, 250]);
    expect(updates).toBe(3);
  });

  it('keeps the position for anything which is no position on the stage', async () => {
    await pick(left, right);

    for (const [index, value] of [
      [0, 'abc'],
      [0, '401'],
      [1, '-401'],
      [2, '-1'],
      [2, '401'],
    ] as [number, string][]) {
      await type(inputs()[index], value);
    }

    expect([left.positionX, left.positionZ, left.positionY]).toEqual([-200, 50, 100]);
    expect([right.positionX, right.positionZ, right.positionY]).toEqual([200, 50, 100]);
  });

  it('turns all picked fixtures by hand, as far as a full turn', async () => {
    await pick(left, right);

    await type(inputs()[3], '30');
    await type(inputs()[4], '60');
    await type(inputs()[5], '360');
    await type(inputs()[5], '361');
    await type(inputs()[4], 'abc');

    expect([left.rotationX, left.rotationY, left.rotationZ]).toEqual([30, 60, 360]);
    expect([right.rotationX, right.rotationY, right.rotationZ]).toEqual([30, 60, 360]);
  });

  it('places and turns the fixtures with the sliders', async () => {
    await pick(left, right);
    const all = sliders();

    for (let i = 0; i < all.length; i++) {
      all[i].setValue(10 + i, false, true);
    }
    await update();

    expect([left.positionX, left.positionZ, left.positionY]).toEqual([10, 11, 12]);
    expect([left.rotationX, left.rotationY, left.rotationZ]).toEqual([13, 14, 15]);
    expect([right.positionX, right.positionZ, right.positionY]).toEqual([10, 11, 12]);
  });

  it('shows the sliders where the fixtures are, in the middle where they differ', async () => {
    left.positionY = 300;
    right.positionY = 300;
    await pick(left, right);

    // the height, from 0 to 400
    expect(sliders()[2].getValue()).toBe(300);

    left.positionY = 100;
    await pick(left, right);

    expect(sliders()[2].getValue()).toBe(200);

    // fixtures on the floor
    left.positionY = 0;
    right.positionY = 0;
    await pick(left, right);

    expect(sliders()[2].getValue()).toBe(0);
    expect(inputs()[2].value).toBe('0');
  });
});
