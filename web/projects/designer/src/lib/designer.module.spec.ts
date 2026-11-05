import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';

import { DesignerModule } from './designer.module';
import { ColorService } from './services/color.service';
import { ProjectService } from './services/project.service';
import { SCENE_COLOR_SOURCE } from './services/scene-color-source';

// The designer as an app embeds it: the module with all of its components. Building it also
// loads every component, which is what the coverage of the specs is measured against.
describe('DesignerModule', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DesignerModule, TranslateModule.forRoot()],
    });
  });

  it('builds with all of its components', async () => {
    await TestBed.compileComponents();

    expect(TestBed.inject(ProjectService)).toBeTruthy();
  });

  it('marks the scenes saved with a project in the colors the color service shows', () => {
    expect(TestBed.inject(SCENE_COLOR_SOURCE)).toBe(TestBed.inject(ColorService));
  });
});
