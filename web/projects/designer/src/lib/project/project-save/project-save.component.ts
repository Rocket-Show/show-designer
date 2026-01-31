import { Component, HostListener, OnInit } from '@angular/core';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { map } from 'rxjs/operators';
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

  selectProject(project: Project) {
    this.projectService.project.name = project.name;
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
      this.warningDialogService
        .show('designer.project.overwrite-warning')
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

  @HostListener('document:keydown.enter', ['$event'])
  handleKeyboardEvent(event: any) {
    this.saveProject();
  }
}
