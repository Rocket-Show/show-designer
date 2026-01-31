import { HttpClient } from '@angular/common/http';
import { Component, HostListener, OnInit } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { DropzoneConfigInterface } from 'ngx-dropzone-wrapper';
import { ToastrService } from 'ngx-toastr';
import { Subject } from 'rxjs';
import { map } from 'rxjs/operators';
import { Composition } from '../../models/composition';
import { ConfigService } from '../../services/config.service';
import { ProjectService } from '../../services/project.service';
import { TimelineService } from '../../services/timeline.service';
import { WarningDialogService } from '../../services/warning-dialog.service';

@Component({
  selector: 'lib-app-composition-settings',
  templateUrl: './composition-settings.component.html',
  styleUrls: ['./composition-settings.component.css'],
  standalone: false,
})
export class CompositionSettingsComponent implements OnInit {
  composition: Composition;
  existingCompositionNames: string[] = [];

  public onClose: Subject<number> = new Subject();

  public dropzoneConfig: DropzoneConfigInterface;
  public uploadMessage: string;

  public existingFiles: string[] = [];
  public filteredExistingFiles: string[] = [];

  public uploading = false;

  constructor(
    public bsModalRef: BsModalRef,
    private timelineService: TimelineService,
    public configService: ConfigService,
    private translateService: TranslateService,
    private http: HttpClient,
    private warningDialogService: WarningDialogService,
    private toastrService: ToastrService,
    public projectService: ProjectService
  ) {}

  ngOnInit() {
    this.loadFiles();

    if (this.timelineService.externalCompositionsAvailable) {
      this.timelineService.getExternalCompositionNames().subscribe((compositionNames) => {
        this.existingCompositionNames = compositionNames;
      });
    }
  }

  getDropzoneUrl() {
    const projectId = this.projectService.project.id ? this.projectService.project.id : '';
    return 'file/upload?compositionUuid=' + this.composition.uuid + '&projectId=' + projectId;
  }

  ok() {
    this.onClose.next(1);
    this.bsModalRef.hide();
  }

  cancel() {
    this.onClose.next(2);
    this.bsModalRef.hide();
  }

  @HostListener('document:keydown.enter', ['$event'])
  handleKeyboardEvent(event: any) {
    this.ok();
  }

  private getNameFromFile(data: any): string {
    return data.name;
  }

  private loadFiles() {
    if (!this.configService.enableMediaLibrary) {
      return;
    }

    this.http
      .get('file/list')
      .pipe(
        map((response: object[]) => {
          this.existingFiles = [];

          for (const file of response) {
            // only load audio files
            if ((file as any).audioFile) {
              this.existingFiles.push(this.getNameFromFile((file as any).audioFile));
            }
          }

          this.filterExistingFiles();
        })
      )
      .subscribe();
  }

  public onUploadError(args: any) {
    const msg = 'designer.misc.toast-upload-error';
    const title = 'designer.misc.toast-upload-error-title';
    this.translateService.get([msg, title]).subscribe((result) => {
      this.toastrService.error(result[msg] + args[1], result[title], { timeOut: 0, extendedTimeOut: 0, enableHtml: true });
      // Hide the preview element
      args[0].previewElement.hidden = true;
    });
  }

  public onUploadSuccess(args: any) {
    this.loadFiles();

    // allow to guess the bpm of the newly uploaded file
    this.composition.tempoGuessed = false;

    // hide the preview element
    args[0].previewElement.hidden = true;

    // select this file
    this.composition.audioFileName = args[0].name;

    if (this.configService.enableMediaLibrary) {
      // the file has been uploaded to the media library
      this.composition.audioFileInLibrary = true;
    }
  }

  public onQueueComplete(args: any) {
    this.uploading = false;
  }

  public onAddedFile(args: any) {
    this.uploading = true;
  }

  // Filter the existing files
  filterExistingFiles(searchValue?: string) {
    if (!searchValue) {
      this.filteredExistingFiles = this.existingFiles;
      return;
    }

    this.filteredExistingFiles = [];

    for (const file of this.existingFiles) {
      if (file.toLowerCase().indexOf(searchValue.toLowerCase()) !== -1) {
        this.filteredExistingFiles.push(file);
      }
    }
  }

  selectExistingFile(existingFile: string) {
    this.composition.audioFileName = existingFile;

    // the file has been selected from the media library
    this.composition.audioFileInLibrary = true;
  }

  deleteFile(existingFile: string) {
    this.warningDialogService
      .show('designer.timeline.warning-delete-file')
      .pipe(
        map((result) => {
          if (result) {
            this.http
              .post('file/delete?name=' + existingFile + '&type=AUDIO', undefined)
              .pipe(
                map((response: Response) => {
                  this.loadFiles();
                })
              )
              .subscribe();
          }
        })
      )
      .subscribe();
  }
}
