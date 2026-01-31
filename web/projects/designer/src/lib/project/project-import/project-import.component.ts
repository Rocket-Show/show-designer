import { Component, HostListener, OnInit } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { DropzoneConfigInterface } from 'ngx-dropzone-wrapper';
import { ToastrService } from 'ngx-toastr';
import { map } from 'rxjs/operators';
import { ProjectLoadService } from '../../services/project-load.service';

@Component({
  selector: 'lib-project-import',
  templateUrl: './project-import.component.html',
  styleUrls: ['./project-import.component.css'],
  standalone: false,
})
export class ProjectImportComponent implements OnInit {
  public dropzoneConfig: DropzoneConfigInterface;
  public uploadMessage: string;

  constructor(
    public bsModalRef: BsModalRef,
    private translateService: TranslateService,
    private toastrService: ToastrService,
    private projectLoadService: ProjectLoadService
  ) {}

  ngOnInit() {
    this.dropzoneConfig = {
      url: 'dummy',
      addRemoveLinks: false,
      maxFilesize: 10 /* 10 MB */,
      acceptedFiles: '.rsd',
      timeout: 0,
      accept: (file: any, done: any) => {
        const reader = new FileReader();
        reader.addEventListener('loadend', (event: any) => {
          this.projectLoadService.import(event.target.result);
          done('noerr');
          this.bsModalRef.hide();
        });
        reader.readAsText(file);
      },
      previewTemplate: `
      <div style="display: none;">
        <!-- No preview -->
      </div>
      `,
    };

    this.translateService
      .get('designer.misc.dropzone-message')
      .pipe(
        map((result) => {
          this.uploadMessage = '<h3 class="mb-0"><i class="fa fa-cloud-upload"></i></h3>' + result;
        })
      )
      .subscribe();
  }

  public onUploadError(args: any) {
    if (args[1] === 'noerr') {
      // this error is set in the accept event listener -> everything OK
      return;
    }

    const msg = 'designer.misc.toast-upload-error';
    const title = 'designer.misc.toast-upload-error-title';
    this.translateService.get([msg, title]).subscribe((result) => {
      this.toastrService.error(result[msg] + args[1], result[title], { timeOut: 0, extendedTimeOut: 0, enableHtml: true });
    });
  }

  ok() {
    this.bsModalRef.hide();
  }

  cancel() {
    this.bsModalRef.hide();
  }

  @HostListener('document:keydown.enter', ['$event'])
  handleKeyboardEvent(event: any) {
    this.ok();
  }
}
