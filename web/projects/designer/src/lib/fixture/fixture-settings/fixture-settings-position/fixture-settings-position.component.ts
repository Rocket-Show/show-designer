import { Component, OnInit } from '@angular/core';
import { Positioning } from '../../../models/fixture';
import { FixtureService } from '../../../services/fixture.service';
import { PresetService } from '../../../services/preset.service';

@Component({
  selector: 'lib-app-fixture-settings-position',
  templateUrl: './fixture-settings-position.component.html',
  styleUrls: ['./fixture-settings-position.component.css'],
  standalone: false,
})
export class FixtureSettingsPositionComponent implements OnInit {
  selectUndefinedOptionValue: any = undefined;

  selectedPositioning: string = undefined;

  positionX = 0;
  positionY = 0;
  positionZ = 0;

  positionXMin = -400;
  positionXMax = 400;
  positionYMin = 0;
  positionYMax = 400;
  positionZMin = -400;
  positionZMax = 400;

  rotationX = 0;
  rotationY = 0;
  rotationZ = 0;

  rotationMin = 0;
  rotationMax = 360;

  constructor(public fixtureService: FixtureService, private presetService: PresetService) {
    presetService.fixtureSelectionSettingsChanged.subscribe(() => {
      this.updateSelection();
    });
  }

  ngOnInit() {}

  private updateSelection() {
    // get all display values for the selected settings fixtures
    this.selectedPositioning = undefined;

    this.positionX = undefined;
    this.positionY = undefined;
    this.positionZ = undefined;

    this.rotationX = undefined;
    this.rotationY = undefined;
    this.rotationZ = undefined;

    for (const fixture of this.fixtureService.selectedSettingsFixtures) {
      if (this.selectedPositioning) {
        if (this.selectedPositioning !== fixture.positioning) {
          this.selectedPositioning = undefined;
          break;
        }
      } else {
        this.selectedPositioning = fixture.positioning;
      }
    }
    for (const fixture of this.fixtureService.selectedSettingsFixtures) {
      if (this.positionX) {
        if (this.positionX !== fixture.positionX) {
          this.positionX = undefined;
          break;
        }
      } else {
        this.positionX = fixture.positionX;
      }
    }
    for (const fixture of this.fixtureService.selectedSettingsFixtures) {
      if (this.positionY) {
        if (this.positionY !== fixture.positionY) {
          this.positionY = undefined;
          break;
        }
      } else {
        this.positionY = fixture.positionY;
      }
    }
    for (const fixture of this.fixtureService.selectedSettingsFixtures) {
      if (this.positionZ) {
        if (this.positionZ !== fixture.positionZ) {
          this.positionZ = undefined;
          break;
        }
      } else {
        this.positionZ = fixture.positionZ;
      }
    }
    for (const fixture of this.fixtureService.selectedSettingsFixtures) {
      if (this.rotationX) {
        if (this.rotationX !== fixture.rotationX) {
          this.rotationX = undefined;
          break;
        }
      } else {
        this.rotationX = fixture.rotationX;
      }
    }
    for (const fixture of this.fixtureService.selectedSettingsFixtures) {
      if (this.rotationY) {
        if (this.rotationY !== fixture.rotationY) {
          this.rotationY = undefined;
          break;
        }
      } else {
        this.rotationY = fixture.rotationY;
      }
    }
    for (const fixture of this.fixtureService.selectedSettingsFixtures) {
      if (this.rotationZ) {
        if (this.rotationZ !== fixture.rotationZ) {
          this.rotationZ = undefined;
          break;
        }
      } else {
        this.rotationZ = fixture.rotationZ;
      }
    }
  }

  changePosition(positioningStr: string) {
    const positioning: Positioning = Positioning[positioningStr];

    for (const fixture of this.fixtureService.selectedSettingsFixtures) {
      fixture.positioning = positioning;
    }
  }

  changePositionManual(position: string, value: any) {
    if (isNaN(value)) {
      return;
    }

    if (position === 'x') {
      if (value >= this.positionXMin && value <= this.positionXMax) {
        this.positionX = +value;
      }
    } else if (position === 'y') {
      if (value >= this.positionYMin && value <= this.positionYMax) {
        this.positionY = +value;
      }
    } else if (position === 'z') {
      if (value >= this.positionZMin && value <= this.positionZMax) {
        this.positionZ = +value;
      }
    }

    for (const fixture of this.fixtureService.selectedSettingsFixtures) {
      if (position === 'x') {
        if (value >= this.positionXMin && value <= this.positionXMax) {
          fixture.positionX = +value;
        }
      } else if (position === 'y') {
        if (value >= this.positionYMin && value <= this.positionYMax) {
          fixture.positionY = +value;
        }
      } else if (position === 'z') {
        if (value >= this.positionZMin && value <= this.positionZMax) {
          fixture.positionZ = +value;
        }
      }
    }
  }

  changeRotationManual(rotation: string, value: any) {
    if (isNaN(value) || value < this.rotationMin || value > this.rotationMax) {
      return;
    }

    if (rotation === 'x') {
      this.rotationX = +value;
    } else if (rotation === 'y') {
      this.rotationY = +value;
    } else if (rotation === 'z') {
      this.rotationZ = +value;
    }

    for (const fixture of this.fixtureService.selectedSettingsFixtures) {
      if (rotation === 'x') {
        fixture.rotationX = +value;
      } else if (rotation === 'y') {
        fixture.rotationY = +value;
      } else if (rotation === 'z') {
        fixture.rotationZ = +value;
      }
    }
  }
}
