import { Component, OnInit } from '@angular/core';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { map } from 'rxjs/operators';
import { Project } from '../../models/project';
import { ConfigService } from '../../services/config.service';
import { ProjectLoadService } from '../../services/project-load.service';
import { ProjectService } from '../../services/project.service';
import { UserService } from '../../services/user.service';
import { WarningDialogService } from '../../services/warning-dialog.service';

@Component({
  selector: 'lib-project-browser',
  templateUrl: './project-browser.component.html',
  styleUrls: ['./project-browser.component.css'],
  standalone: false,
})
export class ProjectBrowserComponent implements OnInit {
  projects: Project[] = [];
  loading = true;

  constructor(
    private bsModalRef: BsModalRef,
    private projectService: ProjectService,
    private projectLoadService: ProjectLoadService,
    private userService: UserService,
    private warningDialogService: WarningDialogService,
    private configService: ConfigService
  ) {
    this.loadProjects();
  }

  private loadProjects() {
    this.projectService.getAllProjects().subscribe((projects) => {
      this.projects = projects;
      this.loading = false;
    });
  }

  ngOnInit() {}

  cancel() {
    this.bsModalRef.hide();
  }

  openProject(project: Project) {
    this.bsModalRef.hide();
    this.projectLoadService.load(project.id, project.name).subscribe(() => {
      this.userService.setAutoLoadProject(project);
    });
  }

  deleteProject(project: Project) {
    this.warningDialogService
      .show('designer.project.delete-warning')
      .pipe(
        map((result) => {
          if (result) {
            this.projectService.deleteProject(project).subscribe((projects) => {
              this.loadProjects();
            });
          }
        })
      )
      .subscribe();
  }
}
