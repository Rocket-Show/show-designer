import { HttpClient } from '@angular/common/http';
import { Injectable, Injector } from '@angular/core';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { ToastrService } from 'ngx-toastr';
import { Observable, Subject } from 'rxjs';
import { map } from 'rxjs/operators';
import { Project } from '../models/project';
import { Scene } from '../models/scene';
import { UserService } from './user.service';
import { ConfigService } from './config.service';
import { SCENE_COLOR_SOURCE } from './scene-color-source';

@Injectable({
  providedIn: 'root',
})
export class ProjectService {
  // the current project
  public project: Project;

  // the project-file versions used in this version of the designer (older ones will be migrated, newer ones are not supported)
  public currentProjectVersion = 10;

  // fires, when another project has been loaded, created or imported
  public projectChanged: Subject<void> = new Subject<void>();

  constructor(
    private http: HttpClient,
    private userService: UserService,
    private router: Router,
    private activatedRoute: ActivatedRoute,
    private translateService: TranslateService,
    private toastrService: ToastrService,
    private configService: ConfigService,
    private injector: Injector
  ) {}

  // The project as it is saved. Each scene carries the color it is marked with as well, which
  // Rocket Show shows it with on its Play screen: a color decided by the presets of a scene can
  // only be read with the presets and the fixtures, which the Play screen does not load. Only
  // written into what is saved, the project itself stays as it is (and nothing is left to undo).
  getSavedJson(project: Project): string {
    // taken when it is needed: the colors are read through the presets, which need this service
    const sceneColorSource = this.injector.get(SCENE_COLOR_SOURCE, null);

    return JSON.stringify(project, (key, value) =>
      value instanceof Scene && sceneColorSource ? { ...value, displayColor: sceneColorSource.getSceneColor(value) } : value
    );
  }

  private saveApi(project: Project): Observable<object> {
    return this.http.post('project', this.getSavedJson(project), { headers: this.userService.getHeaders() }).pipe(
      map((response: any) => {
        if (response) {
          project.id = response.id;
          if (response.shareToken) {
            project.shareToken = response.shareToken;
          }
          const queryParams: Params = {
            id: project.id,
            token: project.shareToken,
          };
          this.router.navigate([], {
            relativeTo: this.activatedRoute,
            queryParams,
            queryParamsHandling: 'merge', // remove to replace all query params by provided
          });
        }
        return null;
      })
    );
  }

  // The presets carry the values of their first step on themselves as well. A Rocket
  // Show which does not know steps yet reads those, so an old player shows the first
  // step of a preset instead of leaving the stage dark. Written on the way out only:
  // the steps are what a project is loaded from.
  writeCompatibilityValues(project: Project) {
    for (const preset of project.presets) {
      const step = preset.steps[0];

      preset.fixtureChannelValues = step ? step.fixtureChannelValues.slice() : [];
      preset.fixtureCapabilityValues = step ? step.fixtureCapabilityValues.slice() : [];
    }
  }

  save(project: Project) {
    // tries to save the project and returns, whether it has been saved or not

    this.writeCompatibilityValues(project);

    if (this.configService.freeUniverseEdit) {
      // persist the freely edited universes together with the project
      project.universes = this.configService.universes;
    }

    this.saveApi(project).subscribe(
      () => {
        const msg = 'designer.project.save-success';
        const title = 'designer.project.save-success-title';

        this.translateService.get([msg, title]).subscribe((result) => {
          this.toastrService.success(result[msg], result[title]);
        });

        this.userService.setAutoLoadProject(project);
      },
      (response) => {
        const msg = 'designer.project.save-error';
        const title = 'designer.project.save-error-title';
        const error = response && response.error ? response.error.error : 'unknown';

        this.translateService.get([msg, title]).subscribe((result) => {
          this.toastrService.error(result[msg] + ' (' + error + ')', result[title]);
        });
      }
    );
  }

  getAllProjects(): Observable<Project[]> {
    return this.http.get('projects', { headers: this.userService.getHeaders() }).pipe(
      map((response: any) => {
        const projects: Project[] = [];
        for (const project of response) {
          const projectObject = new Project(project);
          projects.push(projectObject);
        }
        return projects;
      })
    );
  }

  deleteProject(project: Project): Observable<any> {
    return this.http.delete('project?id=' + project.id + '&name=' + project.name, { headers: this.userService.getHeaders() });
  }

  getProject(id: number, name: string, shareToken?: string): Observable<Project> {
    return this.http.get('project?id=' + id + '&name=' + name + '&token=' + shareToken, { headers: this.userService.getHeaders() }).pipe(
      map((response: any) => {
        const project = new Project(response);
        project.id = id;

        return project;
      })
    );
  }
}
