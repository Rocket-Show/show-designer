import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ToastrModule } from 'ngx-toastr';
import { profiles } from '../../../../conformance/index';
import { PresetFixture } from '../../models/preset-fixture';
import { Project } from '../../models/project';
import { FixtureService } from '../../services/fixture.service';
import { ProjectService } from '../../services/project.service';
import { FixturePixelGridComponent, PixelGridSelection } from './fixture-pixel-grid.component';

describe('FixturePixelGridComponent', () => {
  let fixture: ComponentFixture<FixturePixelGridComponent>;
  let grid: FixturePixelGridComponent;
  let taken: Set<PresetFixture>;
  let selections: PixelGridSelection[];

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [FixturePixelGridComponent],
      imports: [TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });

    const project = new Project({
      fixtureProfiles: [
        matrixProfile(),
        { ...JSON.parse(JSON.stringify(profiles['test/rgb-par'])), uuid: 'par' },
        // two layers of two by two pixels
        {
          uuid: 'cube',
          name: 'Cube',
          categories: ['Pixel Bar'],
          matrix: { pixelCount: [2, 2, 2] },
          availableChannels: { 'Red $pixelKey': { capability: { type: 'ColorIntensity', color: 'Red' } } },
          templateChannels: {},
          modes: [
            {
              name: '8ch',
              shortName: '8ch',
              channels: [
                { insert: 'matrixChannels', repeatFor: 'eachPixelXYZ', channelOrder: 'perPixel', templateChannels: ['Red $pixelKey'] },
              ],
            },
          ],
        },
      ],
      fixtures: [
        { uuid: 'm', name: 'Matrix', profileUuid: 'matrix', modeShortName: '36ch', dmxUniverseUuid: 'u', dmxFirstChannel: 0 },
        { uuid: 'p', name: 'Par', profileUuid: 'par', modeShortName: '6ch', dmxUniverseUuid: 'u', dmxFirstChannel: 40 },
        { uuid: 'c', name: 'Cube', profileUuid: 'cube', modeShortName: '8ch', dmxUniverseUuid: 'u', dmxFirstChannel: 50 },
      ],
    });

    TestBed.inject(ProjectService).project = project;
    TestBed.inject(FixtureService).updateCachedFixtures();

    taken = new Set<PresetFixture>();
    selections = [];
  });

  // a matrix of 4 by 3 pixels, with a group of all of them as well, which the checkbox of the
  // fixture takes already
  function matrixProfile(): any {
    const profile = { ...JSON.parse(JSON.stringify(profiles['test/pixel-matrix'])), uuid: 'matrix' };

    profile.matrix.pixelGroups.Everything = 'all';

    return profile;
  }

  // the rows of the matrix: its general channels and its 12 pixels
  function matrixRows(): PresetFixture[] {
    const rows = [new PresetFixture({ fixtureUuid: 'm' })];

    for (let key = 1; key <= 12; key++) {
      rows.push(new PresetFixture({ fixtureUuid: 'm', pixelKey: String(key) }));
    }

    return rows;
  }

  async function open(fixtureUuid: string, rows: PresetFixture[], width = 300) {
    fixture = TestBed.createComponent(FixturePixelGridComponent);
    grid = fixture.componentInstance;
    fixture.nativeElement.style.width = width + 'px';
    document.body.appendChild(fixture.nativeElement);
    fixture.componentRef.setInput('fixtureUuid', fixtureUuid);
    fixture.componentRef.setInput('rows', rows);
    fixture.componentRef.setInput('isSelected', (row: PresetFixture) => taken.has(row));
    grid.selectRows.subscribe((selection) => {
      selections.push(selection);

      for (const row of selection.rows) {
        if (selection.selected) {
          taken.add(row);
        } else {
          taken.delete(row);
        }
      }
    });
    await update();
  }

  afterEach(() => {
    fixture?.nativeElement.remove();
  });

  async function update() {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const element = (): HTMLElement => fixture.nativeElement;
  const canvas = (): HTMLCanvasElement => element().querySelector('canvas.pixel-grid');
  const buttons = (): string[] => Array.from(element().querySelectorAll('.pixel-grid-button')).map((button) => button.textContent.trim());
  const button = (name: string): HTMLButtonElement =>
    Array.from(element().querySelectorAll<HTMLButtonElement>('.pixel-grid-button')).find(
      (candidate) => candidate.textContent.trim() === name
    );
  const keys = (rows: PresetFixture[]): string[] => rows.map((row) => row.pixelKey || 'general');

  // the color drawn in the middle of a cell, in the canvas' own pixels
  function colorAt(column: number, row: number): number[] {
    const pitch = parseFloat(canvas().style.width) / grid.columns;
    const ratio = canvas().width / parseFloat(canvas().style.width);
    const data = canvas()
      .getContext('2d')
      .getImageData(Math.floor((column + 0.4) * pitch * ratio), Math.floor((row + 0.4) * pitch * ratio), 1, 1).data;

    return Array.from(data);
  }

  const lit = (column: number, row: number): boolean => {
    const [red, green, blue] = colorAt(column, row);

    return red === 253 && green === 126 && blue === 20;
  };

  // a pointer event in the middle of a cell
  function pointer(type: string, column: number, row: number) {
    const bounds = canvas().getBoundingClientRect();
    const pitch = bounds.width / grid.columns;

    canvas().dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        clientX: bounds.left + (column + 0.5) * pitch,
        clientY: bounds.top + (row + 0.5) * pitch,
      })
    );
    fixture.detectChanges();
  }

  it('shows the pixels where they sit in the matrix, its general channels and the groups of the library apart', async () => {
    const rows = matrixRows();
    await open('m', rows);

    expect([grid.columns, grid.gridRows]).toEqual([4, 3]);
    expect(grid.cells.map((cell) => cell.key + '@' + cell.column + ',' + cell.row).slice(0, 6)).toEqual([
      '1@0,0',
      '2@1,0',
      '3@2,0',
      '4@3,0',
      '5@0,1',
      '6@1,1',
    ]);
    expect(buttons()).toEqual(['designer.fixture.general-channels', 'Top', 'Corners']);
    expect(keys(grid.groups[1].rows)).toEqual(['1', '4', '9', '12']);
    // as wide as the panel lets it, at most 14 pixels each
    expect(canvas().style.width).toBe('56px');
    expect(canvas().style.height).toBe('42px');
  });

  it('lights the pixels the preset takes', async () => {
    const rows = matrixRows();
    taken.add(rows[6]);
    await open('m', rows);

    expect(lit(1, 1)).toBe(true);
    expect(lit(0, 0)).toBe(false);
    expect(colorAt(0, 0)[3]).toBeGreaterThan(0);

    // taken elsewhere, e.g. with the checkbox of the fixture
    taken.add(rows[1]);
    fixture.detectChanges();

    expect(lit(0, 0)).toBe(true);
  });

  it('takes a pixel with a click, and releases it with the next one', async () => {
    const rows = matrixRows();
    await open('m', rows);

    pointer('pointerdown', 2, 1);
    pointer('pointerup', 2, 1);

    expect(selections.length).toBe(1);
    expect(keys(selections[0].rows)).toEqual(['7']);
    expect(selections[0].selected).toBe(true);
    expect(lit(2, 1)).toBe(true);

    pointer('pointerdown', 2, 1);
    pointer('pointerup', 2, 1);

    expect(selections[1].selected).toBe(false);
    expect(lit(2, 1)).toBe(false);
  });

  it('takes all pixels a drag passes at once, lit while it goes on', async () => {
    const rows = matrixRows();
    await open('m', rows);

    pointer('pointerdown', 0, 2);
    pointer('pointermove', 1, 2);
    pointer('pointermove', 1, 2);
    pointer('pointermove', 2, 2);

    expect(selections.length).toBe(0);
    expect(lit(1, 2)).toBe(true);
    expect(grid.hoveredKey).toBe('11');

    pointer('pointerup', 2, 2);

    expect(selections.length).toBe(1);
    expect(keys(selections[0].rows)).toEqual(['9', '10', '11']);
    expect(selections[0].selected).toBe(true);
  });

  it('releases all pixels a drag from a taken one passes', async () => {
    const rows = matrixRows();
    rows.forEach((row) => taken.add(row));
    await open('m', rows);

    pointer('pointerdown', 3, 0);
    pointer('pointermove', 3, 1);
    pointer('pointerup', 3, 1);

    expect(keys(selections[0].rows)).toEqual(['4', '8']);
    expect(selections[0].selected).toBe(false);
    expect(taken.has(rows[4])).toBe(false);
  });

  it('forgets a drag which is cancelled, and ignores the space between the pixels of a cube', async () => {
    const rows = matrixRows();
    await open('m', rows);

    pointer('pointerdown', 0, 0);
    pointer('pointercancel', 0, 0);
    pointer('pointerup', 0, 0);
    pointer('pointermove', 1, 0);

    expect(selections.length).toBe(0);
    expect(lit(0, 0)).toBe(false);

    // the layers of a cube next to each other, with a column between them
    const cubeRows = ['(1, 1, 1)', '(2, 1, 1)', '(1, 2, 1)', '(2, 2, 1)', '(1, 1, 2)', '(2, 1, 2)', '(1, 2, 2)', '(2, 2, 2)'].map(
      (pixelKey) => new PresetFixture({ fixtureUuid: 'c', pixelKey })
    );
    fixture.componentRef.setInput('fixtureUuid', 'c');
    fixture.componentRef.setInput('rows', cubeRows);
    fixture.detectChanges();

    expect([grid.columns, grid.gridRows]).toEqual([5, 2]);
    expect(grid.cells[4].column).toBe(3);

    pointer('pointerdown', 2, 0);
    pointer('pointerup', 2, 0);
    pointer('pointermove', 2, 0);

    expect(selections.length).toBe(0);
    expect(grid.hoveredKey).toBe('');
  });

  it('takes all pixels of a group of the library, and releases them once it has all of them', async () => {
    const rows = matrixRows();
    taken.add(rows[1]);
    await open('m', rows);

    expect(button('Top').classList).toContain('partial');

    button('Top').click();
    fixture.detectChanges();

    expect(keys(selections[0].rows)).toEqual(['1', '2', '3', '4']);
    expect(selections[0].selected).toBe(true);
    expect(button('Top').classList).toContain('active');
    expect(lit(3, 0)).toBe(true);

    button('Top').click();
    fixture.detectChanges();

    expect(selections[1].selected).toBe(false);
    expect(button('Top').classList).not.toContain('active');
  });

  it('takes the general channels on their own', async () => {
    const rows = matrixRows();
    await open('m', rows);

    button('designer.fixture.general-channels').click();
    fixture.detectChanges();

    expect(keys(selections[0].rows)).toEqual(['general']);
    expect(button('designer.fixture.general-channels').classList).toContain('active');
  });

  it('shows the groups a mode controls as one as rows of their own', async () => {
    const rows = ['Top', 'Corners'].map((pixelKey) => new PresetFixture({ fixtureUuid: 'm', pixelKey }));
    await open('m', rows);

    expect(buttons()).toEqual(['Top', 'Corners']);
    expect(grid.cells.every((cell) => !cell.presetFixture)).toBe(true);

    // a pixel without a row of its own takes nothing
    pointer('pointerdown', 0, 0);
    pointer('pointerup', 0, 0);

    expect(selections.length).toBe(0);
  });

  it('shows only the rows of a fixture without a matrix', async () => {
    await open('p', [new PresetFixture({ fixtureUuid: 'p' })]);

    expect(canvas()).toBeNull();
    expect(buttons()).toEqual(['designer.fixture.general-channels']);
  });

  it('makes the pixels smaller in a narrow panel', async () => {
    await open('m', matrixRows(), 40);

    expect(canvas().style.width).toBe('40px');

    element().style.width = '300px';
    await new Promise((resolve) => setTimeout(resolve, 50));
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(canvas().style.width).toBe('56px');
  });
});
