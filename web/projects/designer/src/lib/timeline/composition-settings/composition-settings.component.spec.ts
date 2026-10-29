import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BsModalRef, BsModalService } from 'ngx-bootstrap/modal';
import { TypeaheadModule } from 'ngx-bootstrap/typeahead';
import { DropzoneComponent as DropzoneArea, DropzoneModule } from 'ngx-dropzone-wrapper';
import { ToastrModule, ToastrService } from 'ngx-toastr';
import { of } from 'rxjs';

import { DropzoneComponent } from '../../dropzone/dropzone.component';
import { Composition } from '../../models/composition';
import { Project } from '../../models/project';
import { ConfigService } from '../../services/config.service';
import { ProjectService } from '../../services/project.service';
import { TimelineService } from '../../services/timeline.service';
import { WarningDialogService } from '../../services/warning-dialog.service';
import { CompositionSettingsComponent } from './composition-settings.component';

// The settings of a composition: its name, whether it plays along an audio file and which
// one, uploaded or picked from the media library of Rocket Show. The dialog edits a copy,
// the timeline takes it over when the dialog is closed with OK.
describe('CompositionSettingsComponent', () => {
  let fixture: ComponentFixture<CompositionSettingsComponent>;
  let element: HTMLElement;
  let composition: Composition;
  let configService: ConfigService;
  let http: HttpTestingController;
  let hide: jasmine.Spy;
  let closed: number[];

  beforeEach(() => {
    hide = jasmine.createSpy('hide');

    // the upload area of ngx-dropzone-wrapper logs its configuration
    spyOn(console, 'log');

    TestBed.configureTestingModule({
      declarations: [CompositionSettingsComponent, DropzoneComponent],
      imports: [FormsModule, TypeaheadModule.forRoot(), DropzoneModule, TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [
        { provide: BsModalRef, useValue: { hide } },
        BsModalService,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideNoopAnimations(),
      ],
    });

    configService = TestBed.inject(ConfigService);
    configService.restUrl = 'https://show/api/';
    http = TestBed.inject(HttpTestingController);

    const project = new Project();
    project.id = 7;
    TestBed.inject(ProjectService).project = project;

    composition = new Composition();
    composition.uuid = 'song';
    composition.name = 'Song';
    composition.tempoGuessed = true;
  });

  afterEach(() => {
    http.verify();
  });

  function open() {
    fixture = TestBed.createComponent(CompositionSettingsComponent);
    fixture.componentInstance.composition = composition;
    closed = [];
    fixture.componentInstance.onClose.subscribe((result) => closed.push(result));
    element = fixture.nativeElement;
    fixture.detectChanges();
  }

  // the media library of Rocket Show, with what it holds (not only audio files)
  function openWithLibrary(files: any[]) {
    configService.enableMediaLibrary = true;
    open();
    http.expectOne('file/list').flush(files);
    fixture.detectChanges();
  }

  const libraryFiles = (): string[] =>
    Array.from(element.querySelectorAll('#media-library .list-group-item .text-break-word')).map((file) => file.textContent.trim());
  const libraryItem = (name: string): HTMLElement =>
    Array.from(element.querySelectorAll<HTMLElement>('#media-library .list-group-item')).find(
      (item) => item.querySelector('.text-break-word').textContent.trim() === name
    );
  const selectedFile = (): string => element.querySelector('.card-body').textContent.trim();
  const okButton = (): HTMLButtonElement => element.querySelector('.modal-footer button');
  const dropzoneArea = (): DropzoneArea => fixture.debugElement.query(By.directive(DropzoneArea)).componentInstance;

  function type(input: HTMLInputElement, value: string) {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function chooseSyncType(value: string) {
    const select: HTMLSelectElement = element.querySelector('select');
    select.value = value;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  // a file dropped onto the upload area, as Dropzone hands it out
  function droppedFile(name: string): any {
    return { name, previewElement: document.createElement('div') };
  }

  it('renames the composition', () => {
    open();

    expect(element.querySelector('.modal-title').textContent).toBe('Song');

    type(element.querySelector('input.form-control'), 'Encore');

    expect(composition.name).toBe('Encore');
    expect(element.querySelector('.modal-title').textContent).toBe('Encore');
  });

  it('offers the names of the compositions of Rocket Show', fakeAsync(() => {
    TestBed.inject(TimelineService).externalCompositionsAvailable = true;
    open();
    http.expectOne('composition/list').flush([{ name: 'Intro' }, { name: 'Encore' }]);
    fixture.detectChanges();

    const input: HTMLInputElement = element.querySelector('input.form-control');
    input.value = 'enc';
    input.dispatchEvent(new Event('input'));
    tick(100);
    fixture.detectChanges();

    const offered = Array.from(element.querySelectorAll('typeahead-container button')).map((match) => match.textContent.trim());
    expect(offered).toEqual(['Encore']);
  }));

  it('asks for no names, outside of Rocket Show', () => {
    open();

    http.expectNone('composition/list');
    expect(fixture.componentInstance.existingCompositionNames).toEqual([]);
  });

  it('plays along an audio file, or on its own clock', () => {
    open();

    expect(element.querySelector('app-dropzone')).not.toBeNull();
    expect(element.querySelector('p.text-muted')).toBeNull();

    chooseSyncType('none');

    expect(composition.syncType).toBe('none');
    expect(element.querySelector('app-dropzone')).toBeNull();
    expect(element.querySelector('p.text-muted').textContent).toContain('designer.timeline.composition-sync-type-none-hint');
  });

  it('shows the audio file picked, or that there is none yet', () => {
    open();
    expect(selectedFile()).toBe('designer.timeline.composition-no-file-selected');

    composition.audioFileName = 'song.mp3';
    fixture.detectChanges();
    expect(selectedFile()).toBe('song.mp3');
  });

  it('points to the hardware, which plays the lights along the song on its own', () => {
    configService.hardwarePromo = true;
    open();

    const link: HTMLAnchorElement = element.querySelector('.hardware-promo-hint a');
    expect(link.href).toContain('utm_content=composition-audio');
  });

  it('does not point to the hardware on a device of Rocket Show', () => {
    open();

    expect(element.querySelector('.hardware-promo-hint')).toBeNull();
  });

  it('uploads the audio file of the composition into the project', () => {
    open();

    expect(fixture.componentInstance.getDropzoneUrl()).toBe('file/upload?compositionUuid=song&projectId=7');
    expect(fixture.debugElement.query(By.directive(DropzoneComponent)).componentInstance.dropzoneConfig.url).toBe(
      'https://show/api/file/upload?compositionUuid=song&projectId=7'
    );

    TestBed.inject(ProjectService).project.id = undefined;
    expect(fixture.componentInstance.getDropzoneUrl()).toBe('file/upload?compositionUuid=song&projectId=');
  });

  it('picks the file uploaded, and guesses its tempo once it is played', () => {
    open();
    const file = droppedFile('new song.mp3');

    dropzoneArea().DZ_SUCCESS.emit([file, {}]);
    fixture.detectChanges();

    expect(composition.audioFileName).toBe('new song.mp3');
    expect(composition.tempoGuessed).toBe(false);
    expect(composition.audioFileInLibrary).toBe(false);
    expect(file.previewElement.hidden).toBe(true);
    expect(selectedFile()).toBe('new song.mp3');
  });

  it('can only be closed once the upload is done', () => {
    open();

    dropzoneArea().DZ_ADDEDFILE.emit(droppedFile('song.mp3'));
    fixture.detectChanges();
    expect(okButton().disabled).toBe(true);

    dropzoneArea().DZ_QUEUECOMPLETE.emit(undefined);
    fixture.detectChanges();
    expect(okButton().disabled).toBe(false);
  });

  it('tells why an upload failed', () => {
    const error = spyOn(TestBed.inject(ToastrService), 'error');
    open();
    const file = droppedFile('broken.mp3');

    dropzoneArea().DZ_ERROR.emit([file, 'the file is too large']);

    expect(error).toHaveBeenCalledWith(
      'designer.misc.toast-upload-error' + 'the file is too large',
      'designer.misc.toast-upload-error-title',
      {
        timeOut: 0,
        extendedTimeOut: 0,
        enableHtml: true,
      }
    );
    expect(file.previewElement.hidden).toBe(true);
    expect(composition.audioFileName).toBeUndefined();
  });

  it('has no media library outside of Rocket Show', () => {
    open();

    http.expectNone('file/list');
    expect(element.querySelector('#media-library-tab')).toBeNull();
  });

  describe('with the media library of Rocket Show', () => {
    it('lists the audio files of the library by name', () => {
      openWithLibrary([
        { audioFile: { name: 'verse.mp3' } },
        { videoFile: { name: 'intro.mp4' } },
        { audioFile: { name: 'Chorus.mp3' } },
        { audioFile: { name: 'bridge.wav' } },
      ]);

      expect(element.querySelector('#media-library-tab')).not.toBeNull();
      expect(libraryFiles()).toEqual(['bridge.wav', 'Chorus.mp3', 'verse.mp3']);
    });

    it('finds a file by a part of its name', () => {
      openWithLibrary([
        { audioFile: { name: 'Verse.mp3' } },
        { audioFile: { name: 'chorus.mp3' } },
        { audioFile: { name: 'verse 2.mp3' } },
      ]);

      type(element.querySelector('#searchFileList'), 'VERSE');
      expect(libraryFiles()).toEqual(['verse 2.mp3', 'Verse.mp3']);

      type(element.querySelector('#searchFileList'), '');
      expect(libraryFiles().length).toBe(3);
    });

    it('picks a file of the library', () => {
      openWithLibrary([{ audioFile: { name: 'verse.mp3' } }, { audioFile: { name: 'chorus.mp3' } }]);

      libraryItem('chorus.mp3').click();
      fixture.detectChanges();

      expect(composition.audioFileName).toBe('chorus.mp3');
      expect(composition.audioFileInLibrary).toBe(true);
      expect(libraryItem('chorus.mp3').classList).toContain('active');
      expect(libraryItem('verse.mp3').classList).not.toContain('active');
    });

    it('puts a file uploaded into the library and lists it', () => {
      openWithLibrary([]);

      dropzoneArea().DZ_SUCCESS.emit([droppedFile('new.mp3'), {}]);
      http.expectOne('file/list').flush([{ audioFile: { name: 'new.mp3' } }]);
      fixture.detectChanges();

      expect(composition.audioFileName).toBe('new.mp3');
      expect(composition.audioFileInLibrary).toBe(true);
      expect(libraryFiles()).toEqual(['new.mp3']);
    });

    it('deletes a file of the library once that is confirmed, without picking it', () => {
      composition.audioFileName = 'verse.mp3';
      const show = spyOn(TestBed.inject(WarningDialogService), 'show').and.returnValue(of(true));
      openWithLibrary([{ audioFile: { name: 'verse.mp3' } }, { audioFile: { name: 'Rock & Roll #1.mp3' } }]);

      libraryItem('Rock & Roll #1.mp3').querySelector<HTMLElement>('.text-danger').click();

      expect(show).toHaveBeenCalledWith('designer.timeline.warning-delete-file');
      const request = http.expectOne('file/delete?name=Rock%20%26%20Roll%20%231.mp3&type=AUDIO');
      expect(request.request.method).toBe('POST');
      request.flush({});
      http.expectOne('file/list').flush([{ audioFile: { name: 'verse.mp3' } }]);
      fixture.detectChanges();

      expect(composition.audioFileName).toBe('verse.mp3');
      expect(libraryFiles()).toEqual(['verse.mp3']);
    });

    it('keeps a file of the library, when deleting it is cancelled', () => {
      spyOn(TestBed.inject(WarningDialogService), 'show').and.returnValue(of(false));
      openWithLibrary([{ audioFile: { name: 'verse.mp3' } }]);

      libraryItem('verse.mp3').querySelector<HTMLElement>('.text-danger').click();

      http.expectNone((request) => request.url.startsWith('file/delete'));
      expect(composition.audioFileName).toBeUndefined();
    });
  });

  it('is closed with OK', () => {
    open();

    okButton().click();

    expect(closed).toEqual([1]);
    expect(hide).toHaveBeenCalled();
  });

  it('is closed with OK by the enter key', () => {
    open();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(closed).toEqual([1]);
  });

  it('is cancelled', () => {
    open();

    element.querySelector<HTMLElement>('.modal-footer a').click();

    expect(closed).toEqual([2]);
    expect(hide).toHaveBeenCalled();
  });

  it('closes with the cross in the corner, as if nothing had been changed', () => {
    open();

    element.querySelector<HTMLElement>('button.close').click();

    expect(closed).toEqual([]);
    expect(hide).toHaveBeenCalled();
  });
});
