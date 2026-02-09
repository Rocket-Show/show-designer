import { HttpClient } from '@angular/common/http';
import { Injectable, NgZone } from '@angular/core';
import { Observable, Subject, Subscription, timer } from 'rxjs';
import { map } from 'rxjs/operators';
import WaveSurfer from 'wavesurfer.js';
import CursorPlugin from 'wavesurfer.js/dist/plugin/wavesurfer.cursor.min.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugin/wavesurfer.regions.min.js';
import TimeLinePlugin from 'wavesurfer.js/dist/plugin/wavesurfer.timeline.min.js';
import { guess } from 'web-audio-beat-detector';
import { Composition } from '../models/composition';
import { Preset } from '../models/preset';
import { PresetRegionScene } from '../models/preset-region-scene';
import { Scene } from '../models/scene';
import { ScenePlaybackRegion } from '../models/scene-playback-region';
import { ConfigService } from './config.service';
import { PresetService } from './preset.service';
import { ProjectService } from './project.service';
import { SceneService } from './scene.service';

@Injectable({
  providedIn: 'root',
})
export class TimelineService {
  public waveSurfer: WaveSurfer;
  public playState = 'paused';

  public zoom = 0;
  private timeUpdateSubscription: Subscription;
  public currentTime: string;
  private timelineClicking = false;
  public selectedPlaybackRegion: ScenePlaybackRegion;
  private intensity = 0.2;
  private intensitySelectedScene = 0.4;
  private intensityHighlighted = 0.8;
  public duration: string;
  public waveSurferReady: Subject<void> = new Subject();
  public detectChanges: Subject<void> = new Subject();

  // the current composition
  public selectedComposition: Composition;
  public selectedCompositionIndex: number;

  // can we add new compositions based on an external pool and
  // should new compositions not available in this pool be added there?
  public externalCompositionsAvailable = false;

  public loadingAudioFile = false;

  constructor(
    private sceneService: SceneService,
    private presetService: PresetService,
    private projectService: ProjectService,
    private http: HttpClient,
    private configService: ConfigService,
    private ngZone: NgZone
  ) {
    this.presetService.previewSelectionChanged.subscribe(() => {
      this.selectedPlaybackRegion = undefined;
      this.updateRegionSelection();
    });
    this.sceneService.sceneDeleted.subscribe(() => {
      this.redrawAllRegions();
    });
    this.sceneService.sceneSelected.subscribe(() => {
      this.redrawAllRegions();
    });
  }

  private redrawAllRegions() {
    // remove all regions from wavesurver
    if (this.waveSurfer) {
      for (const key of Object.keys(this.waveSurfer.regions.list)) {
        const region: any = this.waveSurfer.regions.list[key];
        region.remove();
      }
    }

    // draw all regions
    this.drawAllRegions();
  }

  private pad(num: number, size: number): string {
    if (!num) {
      num = 0;
    }

    let padded: string = num.toString();
    while (padded.length < size) {
      padded = '0' + padded;
    }

    return padded;
  }

  private msToTime(millis: number, includeMillis: boolean = true): string {
    const ms: number = Math.round(millis % 1000);
    const seconds: number = Math.floor(((millis % 360000) % 60000) / 1000);
    const minutes: number = Math.floor((millis % 3600000) / 60000);

    if (includeMillis) {
      return this.pad(minutes, 2) + ':' + this.pad(seconds, 2) + '.' + this.pad(ms, 3);
    } else {
      return this.pad(minutes, 2) + ':' + this.pad(seconds, 2);
    }
  }

  private updateCurrentTime() {
    if (!this.waveSurfer) {
      return;
    }

    // display the current time
    this.currentTime = this.msToTime(this.waveSurfer.getCurrentTime() * 1000);

    if (!this.waveSurfer.timeline.drawer) {
      return;
    }

    // draw the current cursor on the timeline
    // TODO redrawing the timeline each update is way to expensive.
    // maybe as a better solution use an element, like the cursor inside Wavesurfer to
    // display the progress?
    let x = 0;
    const duration: number = this.waveSurfer.backend.getDuration();
    const width: number =
      this.waveSurfer.params.fillParent && !this.waveSurfer.params.scrollParent
        ? this.waveSurfer.timeline.drawer.getWidth()
        : this.waveSurfer.timeline.drawer.wrapper.scrollWidth * this.waveSurfer.params.pixelRatio;

    x = (width / duration) * this.waveSurfer.getCurrentTime() - 2;

    // update the timeline canvas
    this.waveSurfer.timeline.render();

    // draw the cursor on the timeline
    this.waveSurfer.timeline.canvases.forEach((canvas, i) => {
      const leftOffset = i * this.waveSurfer.timeline.maxCanvasWidth;

      const ctx = canvas.getContext('2d');

      ctx.fillStyle = '#fd7e14';
      ctx.beginPath();
      ctx.moveTo(x - 12 - leftOffset, 20);
      ctx.lineTo(x + 12 - leftOffset, 20);
      ctx.lineTo(x - leftOffset, 45);
      ctx.fill();
    });
  }

  private startTimeUpdater() {
    this.stopTimeUpdater();

    // Avoid triggering change detection with each animation frame -> run outside zone
    this.ngZone.runOutsideAngular(() => {
      const timeUpdater = timer(0, 40);
      this.timeUpdateSubscription = timeUpdater.subscribe(() => {
        this.updateCurrentTime();
      });
    });
  }

  private stopTimeUpdater() {
    if (this.timeUpdateSubscription) {
      this.timeUpdateSubscription.unsubscribe();
    }
  }

  formatTimeCallback(seconds: number, pxPerSec: number) {
    if (this.selectedComposition.gridType === 'musical') {
      return Math.round(seconds / this.selectedComposition.timeSignatureUpper / (60 / this.selectedComposition.beatsPerMinute));
    } else {
      // calculate minutes and seconds from seconds count
      const minutes = parseInt((seconds / 60) as any, 10);
      seconds = parseInt((seconds % 60) as any, 10);

      // fill up seconds with zeroes
      const secondsStr = seconds < 10 ? '0' + seconds : seconds;
      return `${minutes}:${secondsStr}`;
    }
  }

  timeInterval(pxPerSec: number) {
    if (this.selectedComposition.gridType === 'musical') {
      const interval = 60 / this.selectedComposition.beatsPerMinute / this.selectedComposition.gridResolution;

      if (pxPerSec < 40) {
        return interval * 4;
      } else if (pxPerSec < 80) {
        return interval * 2;
      }

      return interval;
    } else {
      if (pxPerSec >= 25) {
        return 1;
      } else if (pxPerSec * 5 >= 25) {
        return 5;
      } else if (pxPerSec * 15 >= 25) {
        return 15;
      }

      return Math.ceil(0.5 / pxPerSec) * 60;
    }
  }

  primaryLabelInterval(pxPerSec: number) {
    if (this.selectedComposition.gridType === 'musical') {
      const interval = this.selectedComposition.timeSignatureUpper * this.selectedComposition.gridResolution;

      return interval;
    } else {
      if (pxPerSec >= 25) {
        return 10;
      } else if (pxPerSec * 5 >= 25) {
        return 6;
      } else if (pxPerSec * 15 >= 25) {
        return 4;
      }

      return 4;
    }
  }

  secondaryLabelInterval(pxPerSec: number) {
    if (this.selectedComposition.gridType === 'musical') {
      return 0;
    } else {
      if (pxPerSec >= 25) {
        return 5;
      } else if (pxPerSec * 5 >= 25) {
        return 2;
      } else if (pxPerSec * 15 >= 25) {
        return 2;
      }
      return 2;
    }
  }

  private seeekWithTimeline(e: any) {
    // taken from wavesurfer -> drawer -> handleEvent
    const clientX = e.targetTouches ? e.targetTouches[0].clientX : e.clientX;
    const bbox = this.waveSurfer.timeline.wrapper.getBoundingClientRect();

    const nominalWidth = this.waveSurfer.timeline.drawer.width;
    const parentWidth = this.waveSurfer.timeline.drawer.getWidth();

    let progress: number;

    if (!this.waveSurfer.timeline.drawer.params.fillParent && nominalWidth < parentWidth) {
      progress =
        (this.waveSurfer.timeline.drawer.params.rtl ? bbox.right - clientX : clientX - bbox.left) *
          (this.waveSurfer.timeline.drawer.params.pixelRatio / nominalWidth) || 0;

      if (progress > 1) {
        progress = 1;
      }
    } else {
      progress =
        ((this.waveSurfer.timeline.drawer.params.rtl ? bbox.right - clientX : clientX - bbox.left) +
          this.waveSurfer.timeline.wrapper.scrollLeft) /
          this.waveSurfer.timeline.wrapper.scrollWidth || 0;
    }

    progress = Math.max(progress, 0);

    setTimeout(() => {
      this.waveSurfer.seekTo(progress);
      this.detectChanges.next();
    }, 0);
  }

  applyZoom(zoom: any) {
    if (zoom < 0 || zoom > 200) {
      return;
    }

    this.zoom = zoom;
    if (this.waveSurfer) {
      setTimeout(() => {
        this.waveSurfer.zoom(this.zoom);
        this.updateCurrentTime();
      }, 0);
    }
  }

  private isWaveSurferReady(): boolean {
    if (!this.waveSurfer) {
      return false;
    }

    if (!this.waveSurfer.isReady) {
      return false;
    }

    return true;
  }

  addRegion(waveSurferRegion?: any) {
    if (!this.isWaveSurferReady()) {
      return;
    }

    if (!this.sceneService.selectedScenes || this.sceneService.selectedScenes.length !== 1) {
      return;
    }

    if (!this.selectedComposition) {
      return;
    }

    const scenePlaybackRegion: ScenePlaybackRegion = new ScenePlaybackRegion();
    scenePlaybackRegion.sceneUuid = this.sceneService.selectedScenes[0].uuid;

    if (waveSurferRegion) {
      scenePlaybackRegion.startMillis = waveSurferRegion.start * 1000;
      scenePlaybackRegion.endMillis = waveSurferRegion.end * 1000;
    } else {
      scenePlaybackRegion.startMillis = (this.waveSurfer.getDuration() * 1000) / 3;
      scenePlaybackRegion.endMillis = ((this.waveSurfer.getDuration() * 1000) / 3) * 2;
    }

    this.selectedComposition.scenePlaybackRegions.push(scenePlaybackRegion);

    this.selectedPlaybackRegion = scenePlaybackRegion;

    if (waveSurferRegion) {
      waveSurferRegion.color =
        'rgba(' +
        this.hexToRgb(this.sceneService.selectedScenes[0].color).r +
        ', ' +
        this.hexToRgb(this.sceneService.selectedScenes[0].color).g +
        ', ' +
        this.hexToRgb(this.sceneService.selectedScenes[0].color).b +
        ', ' +
        this.intensityHighlighted +
        ')';
      waveSurferRegion.attributes.selectable = true;
      this.connectRegion(waveSurferRegion, this.sceneService.selectedScenes[0], scenePlaybackRegion);
      this.updateRegionSelection();
    } else {
      this.drawRegion(scenePlaybackRegion, this.sceneService.selectedScenes[0]);
    }

    this.presetService.previewLive();
  }

  private getSnapToGridInterval(): number {
    if (this.selectedComposition.snapToGrid) {
      return 60 / this.selectedComposition.beatsPerMinute / this.selectedComposition.gridResolution;
    }

    return undefined;
  }

  private getSnapToGridOffset(): number {
    return this.selectedComposition.gridOffsetMillis / 1000;
  }

  deleteSelectedComposition() {
    this.projectService.project.compositions.splice(this.selectedCompositionIndex, 1);
    this.selectedComposition = undefined;
    this.selectedCompositionIndex = undefined;
    this.destroyWaveSurfer();
    if (this.projectService.project.compositions.length > 0) {
      this.selectCompositionIndex(0);
    }
  }

  destroyWaveSurfer() {
    this.duration = undefined;
    this.loadingAudioFile = false;

    if (this.waveSurfer) {
      this.waveSurfer.destroy();
      this.waveSurfer = undefined;
    }
  }

  createWaveSurfer() {
    this.destroyWaveSurfer();

    if (!this.selectedComposition.audioFileName) {
      return;
    }

    this.loadingAudioFile = true;

    setTimeout(() => {
      this.waveSurfer = WaveSurfer.create({
        container: '#waveform',
        waveColor: 'white',
        progressColor: 'white',
        // barWidth: 2,
        height: 1,
        interact: false,
        // Use for timelines without sound. Wave will be displayed
        // wrong, but should work for a dummy audio without any waves.
        // duration: 400,
        plugins: [
          CursorPlugin.create({
            // showTime: true,
            opacity: 1,
            color: '#fd7e14',
            hideOnBlur: false /* don't show/hide the cursor on the wave (only on the timeline) */,
          }),
          RegionsPlugin.create({
            dragSelection: {
              slop: 5,
            },
            color: '#fff',
            snapToGridInterval: this.getSnapToGridInterval(),
            snapToGridOffset: this.getSnapToGridOffset(),
          }),
          TimeLinePlugin.create({
            container: '#waveform-timeline',
            primaryFontColor: '#fff',
            secondaryFontColor: '#fff',
            offset: this.getSnapToGridOffset(),
            formatTimeCallback: this.formatTimeCallback.bind(this),
            timeInterval: this.timeInterval.bind(this),
            primaryLabelInterval: this.primaryLabelInterval.bind(this),
            secondaryLabelInterval: this.secondaryLabelInterval.bind(this),
          }),
        ],
      });

      let audioFileName: string;

      if (this.configService.enableMediaLibrary) {
        // the file name is also used for the real file name
        audioFileName = 'file/get?name=' + this.selectedComposition.audioFileName + '&type=AUDIO';
      } else {
        // the composition uuid and extension is used as the file name
        audioFileName =
          'composition-files/?file=' +
          this.selectedComposition.uuid +
          '.' +
          this.selectedComposition.audioFileName.substr(this.selectedComposition.audioFileName.lastIndexOf('.') + 1);
      }

      this.waveSurfer.load(this.configService.restUrl + audioFileName);

      this.waveSurfer.on('ready', () => {
        setTimeout(() => {
          // try guessing the bpm and offset from the file, if necessary
          if (this.selectedComposition.tempoGuessed) {
            // we already guessed the BPM of this file --> don't do it again
            this.loadingAudioFile = false;
          } else {
            // we have not yet guessed the BPM --> do it now
            this.selectedComposition.tempoGuessed = true;
            guess(this.waveSurfer.backend.buffer)
              .then(({ bpm, offset }) => {
                // the bpm and offset could be guessed
                this.selectedComposition.beatsPerMinute = bpm;
                this.selectedComposition.gridOffsetMillis = offset * 1000;
                this.loadingAudioFile = false;
              })
              .catch((err) => {
                // something went wrong
                console.error('Could not detect the BPM from the audio file', err);
                this.loadingAudioFile = false;
              });
          }

          this.duration = this.msToTime(this.waveSurfer.getDuration() * 1000);
          this.drawAllRegions();

          // scroll wavesurfer in sync with the timeline
          this.waveSurfer.timeline.wrapper.addEventListener('scroll', () => {
            this.waveSurfer.drawer.wrapper.scrollLeft = this.waveSurfer.timeline.wrapper.scrollLeft;

            // Set the scroll position of the timeline to the same position as the wavesurfer,
            // because the timeline is larger than wavesurfer and might get out of sync.
            // This way, if wavesurfer cannot scroll any further, we reset the position
            // of the timeline as well.
            this.waveSurfer.timeline.wrapper.scrollLeft = this.waveSurfer.drawer.wrapper.scrollLeft;
          });

          // display the cursor also on the timeline
          this.waveSurfer.timeline.wrapper.addEventListener('mouseenter', () => {
            this.waveSurfer.cursor.showCursor();
          });
          this.waveSurfer.timeline.wrapper.addEventListener('mouseleave', () => {
            this.waveSurfer.cursor.hideCursor();
          });
          this.waveSurfer.timeline.wrapper.addEventListener('mousemove', (e: any) => {
            const bbox = this.waveSurfer.container.getBoundingClientRect();
            const x = e.clientX - bbox.left;
            this.waveSurfer.cursor.updateCursorPosition(x, 0);
          });

          // hide the cursor on the wave initially. in combination with the param hideOnBlur = false,
          // it will never be displayed on the wave now. we handle it on the timeline only.
          this.waveSurfer.cursor.hideCursor();

          // seek on timeline-click
          this.waveSurfer.timeline.wrapper.addEventListener('mousedown', (e: any) => {
            this.timelineClicking = true;
            this.seeekWithTimeline(e);
          });

          this.waveSurfer.timeline.wrapper.addEventListener('mousemove', (e: any) => {
            if (this.timelineClicking) {
              this.seeekWithTimeline(e);
            }
          });

          this.waveSurfer.timeline.wrapper.addEventListener('mouseup', (e: any) => {
            this.timelineClicking = false;
          });

          this.updateCurrentTime();

          this.detectChanges.next();
          this.waveSurferReady.next();
        }, 0);
      });

      this.waveSurfer.on('error', (error: any) => {
        // could not load the composition --> delete it
        // (this may occur, when the composition has been deleted but the project is not saved afterwards)
        this.deleteSelectedComposition();
      });

      this.waveSurfer.on('seek', () => {
        this.updateCurrentTime();
      });

      this.waveSurfer.on('play', () => {
        this.startTimeUpdater();
      });

      this.waveSurfer.on('pause', () => {
        this.stopTimeUpdater();
      });

      this.waveSurfer.on('region-created', (region) => {
        // region created by selection or programmatically
        if (this.sceneService.selectedScenes && this.sceneService.selectedScenes.length === 1) {
          if (!region.data.handled) {
            this.addRegion(region);
          }
        } else {
          if (!region.data.handled) {
            region.remove();
          }
        }
      });

      this.waveSurfer.on('region-updated', (region: any) => {
        this.detectChanges.next();
        this.presetService.previewLive();
      });
    }, 0);
  }

  private hexToRgb(hex: string) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : null;
  }

  private updateRegionSelection() {
    if (!this.waveSurfer) {
      return;
    }

    for (const key of Object.keys(this.waveSurfer.regions.list)) {
      const region: any = this.waveSurfer.regions.list[key];

      // if no scene is set, the region is not valid (e.g. has been created, while
      // no scene has been selected and remove did not work properly)
      if (region.scene) {
        let intensity = this.intensity;

        region.drag = false;
        region.resize = false;
        region.attributes.selectable = false;

        if (this.sceneService.sceneIsSelected(region.scene)) {
          intensity = this.intensitySelectedScene;
          region.drag = true;
          region.resize = true;
          region.attributes.selectable = true;
        }

        region.attributes.selected = false;

        if (this.selectedPlaybackRegion && this.selectedPlaybackRegion === region.scenePlaybackRegion) {
          intensity = this.intensityHighlighted;
          region.attributes.selected = true;
        }

        region.color =
          'rgba(' +
          this.hexToRgb(region.scene.color).r +
          ', ' +
          this.hexToRgb(region.scene.color).g +
          ', ' +
          this.hexToRgb(region.scene.color).b +
          ', ' +
          intensity +
          ')';
        region.updateRender();
      }
    }
  }

  updateSelectedRegion() {
    if (!this.waveSurfer) {
      return;
    }

    if (!this.selectedPlaybackRegion) {
      return;
    }

    for (const key of Object.keys(this.waveSurfer.regions.list)) {
      const region: any = this.waveSurfer.regions.list[key];

      if (this.selectedPlaybackRegion === region.scenePlaybackRegion) {
        region.start = this.selectedPlaybackRegion.startMillis / 1000;
        region.end = this.selectedPlaybackRegion.endMillis / 1000;
        region.updateRender();
        break;
      }
    }
  }

  private setSelectedRegion(scenePlaybackRegion?: ScenePlaybackRegion) {
    if (this.selectedPlaybackRegion && this.selectedPlaybackRegion === scenePlaybackRegion) {
      // No update required
      return;
    }

    if (scenePlaybackRegion) {
      this.selectedPlaybackRegion = scenePlaybackRegion;
    }

    this.updateRegionSelection();
  }

  private getRegionSnapToGridValue(value: number): number {
    // the regions should snap to a grid
    const offset = this.getSnapToGridOffset() || 0;
    const interval = this.getSnapToGridInterval() || 0;
    return Math.round((value - offset) / interval) * interval + offset;
  }

  private connectRegion(waveSurferRegion: any, scene: Scene, scenePlaybackRegion: ScenePlaybackRegion, preset?: Preset) {
    waveSurferRegion.scenePlaybackRegion = scenePlaybackRegion;
    waveSurferRegion.scene = scene;
    waveSurferRegion.preset = preset;

    waveSurferRegion.on('click', (event) => {
      if (this.sceneService.sceneIsSelected(scene)) {
        this.setSelectedRegion(scenePlaybackRegion);
      }
    });

    waveSurferRegion.on('update', () => {
      this.setSelectedRegion(scenePlaybackRegion);
      if (this.selectedComposition.snapToGrid) {
        // update the regions boundaries. they may not snap to grid, if it has been
        // disabled during creation of the region but activated afterwards.
        waveSurferRegion.start = this.getRegionSnapToGridValue(waveSurferRegion.start);
        waveSurferRegion.end = this.getRegionSnapToGridValue(waveSurferRegion.end);
      }
      scenePlaybackRegion.startMillis = Math.round(waveSurferRegion.start * 1000);
      scenePlaybackRegion.endMillis = Math.round(waveSurferRegion.end * 1000);
    });
  }

  private drawRegion(scenePlaybackRegion: ScenePlaybackRegion, scene: Scene) {
    // draw the regions of the currently selected scene
    if (!this.isWaveSurferReady()) {
      return;
    }

    // add the playback region
    const waveSurferRegion = this.waveSurfer.addRegion({
      start: scenePlaybackRegion.startMillis / 1000,
      end: scenePlaybackRegion.endMillis / 1000,
      color: '#fff',
      data: { handled: true },
    });
    this.connectRegion(waveSurferRegion, scene, scenePlaybackRegion);

    // TODO show the all presets
    // for (let presetUuid of scene.presetUuids) {
    //   const preset = this.presetService.getPresetByUuid(presetUuid);

    //   let waveSurferRegion = this.timelineService.waveSurfer.addRegion({
    //     start: (scenePlaybackRegion.startMillis + (preset.startMillis ? preset.startMillis : 0)) / 1000,
    //     end: (scenePlaybackRegion.startMillis
    //       + (preset.endMillis ? preset.endMillis : scenePlaybackRegion.endMillis - scenePlaybackRegion.startMillis)) / 1000,
    //     color: '#fff',
    //     data: { handled: true },
    //     // TODO
    //     attributes: {
    //       preset: true,
    //       name: 'Preset 1'
    //     }
    //   });
    //   this.connectRegion(waveSurferRegion, scene, scenePlaybackRegion, preset);
    // }

    this.updateRegionSelection();
  }

  removeRegion() {
    if (!this.selectedPlaybackRegion) {
      return;
    }

    if (this.sceneService.selectedScenes.length !== 1) {
      return;
    }

    for (let i = 0; i < this.selectedComposition.scenePlaybackRegions.length; i++) {
      if (this.selectedComposition.scenePlaybackRegions[i] === this.selectedPlaybackRegion) {
        // remove the region from wavesurfer
        for (const key of Object.keys(this.waveSurfer.regions.list)) {
          const region: any = this.waveSurfer.regions.list[key];

          if (region.scenePlaybackRegion === this.selectedPlaybackRegion) {
            region.remove();
          }
        }

        this.selectedPlaybackRegion = undefined;
        this.selectedComposition.scenePlaybackRegions.splice(i, 1);

        return;
      }
    }

    this.presetService.previewLive();
  }

  getPresetsInTime(timeMillis: number): PresetRegionScene[] {
    // Return all presets which should be active during the specified time
    const activePresets: PresetRegionScene[] = [];

    for (let sceneIndex = this.projectService.project.scenes.length - 1; sceneIndex >= 0; sceneIndex--) {
      const scene = this.projectService.project.scenes[sceneIndex];

      for (const region of this.selectedComposition.scenePlaybackRegions) {
        if (region.sceneUuid === scene.uuid) {
          for (let presetIndex = this.projectService.project.presets.length - 1; presetIndex >= 0; presetIndex--) {
            for (const presetUuid of scene.presetUuids) {
              if (presetUuid === this.projectService.project.presets[presetIndex].uuid) {
                const preset = this.presetService.getPresetByUuid(presetUuid);

                if (preset) {
                  let presetStartMillis = preset.startMillis === undefined ? region.startMillis : region.startMillis + preset.startMillis;
                  let presetEndMillis = preset.endMillis === undefined ? region.endMillis : region.startMillis + preset.endMillis;

                  // extend the running time, if fading is done outside the boundaries
                  presetStartMillis -= preset.fadeInPre ? preset.fadeInMillis : 0;
                  presetEndMillis += preset.fadeOutPost ? preset.fadeOutMillis : 0;

                  if (presetStartMillis <= timeMillis && presetEndMillis >= timeMillis) {
                    activePresets.push(new PresetRegionScene(preset, region, scene));
                  }
                }
              }
            }
          }
        }
      }
    }

    return activePresets;
  }

  drawAllRegions() {
    if (!this.selectedComposition) {
      return;
    }

    // draw the regions in the same order as their corresponding scenes, but draw
    // the selected ones last, to make sure they're always clickable.
    for (let sceneIndex = this.projectService.project.scenes.length - 1; sceneIndex >= 0; sceneIndex--) {
      const scene = this.projectService.project.scenes[sceneIndex];
      if (!this.sceneService.sceneIsSelected(scene)) {
        for (const scenePlaybackRegion of this.selectedComposition.scenePlaybackRegions) {
          if (scenePlaybackRegion.sceneUuid === scene.uuid) {
            this.drawRegion(scenePlaybackRegion, scene);
          }
        }
      }
    }

    // draw all selected scenes afterwards
    for (let sceneIndex = this.projectService.project.scenes.length - 1; sceneIndex >= 0; sceneIndex--) {
      const scene = this.projectService.project.scenes[sceneIndex];

      if (this.sceneService.sceneIsSelected(scene)) {
        for (const scenePlaybackRegion of this.selectedComposition.scenePlaybackRegions) {
          if (scenePlaybackRegion.sceneUuid === scene.uuid) {
            this.drawRegion(scenePlaybackRegion, scene);
          }
        }
      }
    }
  }

  updateGrid() {
    if (this.waveSurferReady) {
      this.waveSurfer.timeline.params.offset = this.getSnapToGridOffset();

      this.waveSurfer.regions.params.snapToGridInterval = this.getSnapToGridInterval();
      this.waveSurfer.regions.params.snapToGridOffset = this.getSnapToGridOffset();
    }
    this.updateCurrentTime();
  }

  getExternalCompositionNames(): Observable<string[]> {
    // get available compositions from an external pool (e.g. Rocket Show)
    return this.http.get('composition/list').pipe(
      map((response: object[]) => {
        const compositionNames: string[] = [];

        for (const responseComposition of response) {
          compositionNames.push((responseComposition as any).name);
        }

        return compositionNames;
      })
    );
  }

  selectCompositionIndex(index: number) {
    this.selectedComposition = this.projectService.project.compositions[index];
    this.selectedCompositionIndex = index;
    this.projectService.project.selectedCompositionUuid = this.selectedComposition.uuid;
    this.createWaveSurfer();

    // required to trigger timeline.component.resize()
    this.waveSurferReady.next();

    this.applyZoom(0);
  }
}
