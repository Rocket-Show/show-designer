import { Component, HostListener, OnInit } from '@angular/core';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { Project } from '../../models/project';
import { ConfigService } from '../../services/config.service';
import { ProjectService } from '../../services/project.service';
import { WarningDialogService } from '../../services/warning-dialog.service';

@Component({
  selector: 'lib-project-save',
  templateUrl: './project-save.component.html',
  styleUrls: ['./project-save.component.css'],
  standalone: false,
})
export class ProjectSaveComponent implements OnInit {
  projects: Project[] = [];
  loading = true;
  projectName: string;

  // a warning is open on top of this dialog: the enter key answers the warning, it doesn't
  // save the project as well
  private warningOpen = false;

  constructor(
    private bsModalRef: BsModalRef,
    private projectService: ProjectService,
    private warningDialogService: WarningDialogService,
    private configService: ConfigService
  ) {
    this.loadProjects();
    if (this.projectService.project.name) {
      this.projectName = this.projectService.project.name;
    } else {
      this.projectName = 'New Project';
    }
  }

  ngOnInit() {}

  private loadProjects() {
    this.projectService.getAllProjects().subscribe((projects) => {
      this.projects = projects;
      this.loading = false;
    });
  }

  cancel() {
    this.bsModalRef.hide();
  }

  // save over a project of the list
  selectProject(project: Project) {
    this.projectName = project.name;
  }

  private warn(message: string): Observable<boolean> {
    this.warningOpen = true;
    return this.warningDialogService.show(message).pipe(tap(() => (this.warningOpen = false)));
  }

  private existingProject(uuid: string, name: string) {
    for (const project of this.projects) {
      if (project.name === name && project.uuid !== uuid) {
        return true;
      }
    }
    return false;
  }

  private doSave() {
    this.projectService.project.name = this.projectName;
    this.projectService.save(this.projectService.project);
    this.bsModalRef.hide();
  }

  saveProject() {
    if (this.existingProject(this.projectService.project.uuid, this.projectName) && this.configService.uniqueProjectNames) {
      this.warn('designer.project.overwrite-warning')
        .pipe(
          map((result) => {
            if (result) {
              this.doSave();
            }
          })
        )
        .subscribe();
    } else {
      this.doSave();
    }
  }

  deleteProject(project: Project) {
    this.warn('designer.project.delete-warning')
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

  @HostListener('document:keydown.enter', ['$event'])
  handleKeyboardEvent(event: any) {
    if (!this.warningOpen) {
      this.saveProject();
    }
  }
}
