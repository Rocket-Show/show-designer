import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';
import { DropzoneDirective, DropzoneModule } from 'ngx-dropzone-wrapper';

import { ConfigService } from '../services/config.service';
import { DropzoneComponent } from './dropzone.component';

// The dropzone uploads the files dropped onto it (e.g. the audio file of a composition) to
// the REST API of the host, and reports how it went.
describe('DropzoneComponent', () => {
  let fixture: ComponentFixture<DropzoneComponent>;
  let configService: ConfigService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [DropzoneComponent],
      imports: [DropzoneModule, TranslateModule.forRoot()],
    });

    configService = TestBed.inject(ConfigService);
    configService.restUrl = 'https://example.com/api/';

    // the wrapper of Dropzone logs the options of each Dropzone it creates
    spyOn(console, 'log');
  });

  function open(inputs: { url?: string; acceptedFiles?: string; maxFiles?: number }) {
    fixture = TestBed.createComponent(DropzoneComponent);
    for (const name of Object.keys(inputs)) {
      fixture.componentRef.setInput(name, (inputs as any)[name]);
    }
    fixture.detectChanges();
  }

  // the Dropzone doing the uploads
  function dropzone(): any {
    return fixture.debugElement.query(By.directive(DropzoneDirective)).injector.get(DropzoneDirective).dropzone();
  }

  it('uploads each file on its own to the API, with the credentials', () => {
    open({ url: 'file-upload?type=audio', acceptedFiles: 'audio/*', maxFiles: 1 });

    const options = dropzone().options;
    expect(options.url).toBe('https://example.com/api/file-upload?type=audio');
    expect(options.paramName).toBe('file');
    expect(options.acceptedFiles).toBe('audio/*');
    expect(options.maxFiles).toBe(1);
    expect(options.withCredentials).toBe(true);
    expect(options.parallelUploads).toBe(1);
  });

  it('follows the address it is given later', () => {
    open({ url: 'file-upload?composition=1' });

    fixture.componentRef.setInput('url', 'file-upload?composition=2');
    fixture.detectChanges();

    expect(dropzone().options.url).toBe('https://example.com/api/file-upload?composition=2');
  });

  it('uploads in chunks of 2 MB, unless the host takes the files as a whole', () => {
    open({ url: 'upload' });

    expect(dropzone().options.chunking).toBe(true);
    expect(dropzone().options.forceChunking).toBe(true);
    expect(dropzone().options.chunkSize).toBe(2 * 1024 * 1024);

    configService.dropzoneChunking = false;
    open({ url: 'upload' });

    expect(dropzone().options.chunking).toBe(false);
  });

  it('asks for the files to be dropped', () => {
    open({ url: 'upload' });

    const message: HTMLElement = fixture.nativeElement.querySelector('.dz-text');
    expect(message.querySelector('i.fa-cloud-upload')).not.toBeNull();
    expect(message.textContent).toBe('designer.misc.dropzone-message');
  });

  it("reports the files dropped, the ones it doesn't take and when it's done with them", fakeAsync(() => {
    open({ url: 'upload', acceptedFiles: 'audio/*' });
    // the wrapper of Dropzone hands its events on from the next turn on
    tick();
    const added: any[] = [];
    const errors: any[] = [];
    let done = 0;
    fixture.componentInstance.addedFile.subscribe((file) => added.push(file));
    fixture.componentInstance.error.subscribe((args) => errors.push(args));
    fixture.componentInstance.queueComplete.subscribe(() => done++);

    const file = new File(['notes'], 'notes.txt', { type: 'text/plain' });
    dropzone().addFile(file);
    tick();

    expect(added).toEqual([file]);
    expect(errors.length).toBe(1);
    expect(errors[0][0]).toBe(file);
    expect(errors[0][1]).toBe("You can't upload files of this type.");
    expect(done).toBe(1);
  }));

  it('reports the files uploaded', fakeAsync(() => {
    open({ url: 'upload' });
    tick();
    const uploaded: any[] = [];
    fixture.componentInstance.success.subscribe((args) => uploaded.push(args));

    const file = new File(['audio'], 'song.mp3', { type: 'audio/mpeg' });
    dropzone().emit('success', file, 'OK');

    expect(uploaded).toEqual([[file, 'OK']]);
  }));
});
