import { Component, HostListener, OnInit } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { DropzoneConfigInterface } from 'ngx-dropzone-wrapper';
import { ToastrService } from 'ngx-toastr';
import { Subject } from 'rxjs';
import { map } from 'rxjs/operators';
import { FixtureProfile } from '../../models/fixture-profile';
import { FixtureService } from '../../services/fixture.service';
import { ProjectService } from '../../services/project.service';

@Component({
  selector: 'lib-fixture-pool-create-from-file',
  templateUrl: './fixture-pool-create-from-file.component.html',
  styleUrls: ['./fixture-pool-create-from-file.component.css'],
  standalone: false,
})
export class FixturePoolCreateFromFileComponent implements OnInit {
  public dropzoneConfig: DropzoneConfigInterface;
  public uploadMessage: string;
  public onClose: Subject<FixtureProfile> = new Subject();

  constructor(
    public bsModalRef: BsModalRef,
    private translateService: TranslateService,
    private toastrService: ToastrService,
    private fixtureService: FixtureService,
    private projectService: ProjectService
  ) {}

  ngOnInit() {
    this.dropzoneConfig = {
      url: 'dummy',
      addRemoveLinks: false,
      maxFilesize: 10 /* 10 MB */,
      acceptedFiles: '.json',
      timeout: 0,
      accept: (file: any, done: any) => {
        const reader = new FileReader();
        reader.addEventListener('loadend', (event: any) => {
          // validate the file
          const text = event.target.result;
          const json = JSON.parse(text);
          if (
            json['$schema'].match(
              'https://raw.githubusercontent.com/OpenLightingProject/open-fixture-library/schema-(.*)/schemas/fixture.json'
            )
          ) {
            // create the metadata from the file. we don't have the corresponding
            // manufacturer-file, therefore we just assume the attributes from the
            // fixture-file.
            const manufacturerShortName = json['manufacturerKey'];
            const manufacturerName = manufacturerShortName;
            const uuid = manufacturerShortName + '/' + json['fixtureKey'];
            const profile = new FixtureProfile(json);

            profile.manufacturerShortName = manufacturerShortName;
            profile.manufacturerName = manufacturerName;
            profile.uuid = uuid;
            profile.createdFromFile = true;

            // add the profile to the project, if not already added
            const loadedProfile = this.fixtureService.getProfileByUuid(uuid);
            if (!loadedProfile) {
              this.projectService.project.fixtureProfiles.push(profile);
            }

            // add a new fixture from this profile
            this.onClose.next(profile);
            this.bsModalRef.hide();
          } else {
            // show an error toast
            const msg = 'designer.fixture-pool.invalid-fixture-profile-file';
            const title = 'designer.misc.toast-upload-error-title';
            this.translateService.get([msg, title]).subscribe((result) => {
              this.toastrService.error(result[msg], result[title], { timeOut: 0, extendedTimeOut: 0, enableHtml: true });
            });
          }

          done('noerr');
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
    this.onClose.next(undefined);
    this.bsModalRef.hide();
  }

  cancel() {
    this.onClose.next(undefined);
    this.bsModalRef.hide();
  }

  @HostListener('document:keydown.enter', ['$event'])
  handleKeyboardEvent(event: any) {
    this.ok();
  }
}
