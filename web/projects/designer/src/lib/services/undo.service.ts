import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { Project } from '../models/project';
import { ProjectLoadService } from './project-load.service';
import { ProjectService } from './project.service';

@Injectable({
  providedIn: 'root',
})
export class UndoService implements OnDestroy {
  // how many states an undo can go back through
  private static readonly maxSteps = 50;

  // how much of them to keep at most. A project with a lot of fixture profiles in it
  // weighs a few megabytes, so a number of steps alone is not much of a bound.
  private static readonly maxCharacters = 64 * 1024 * 1024;

  // how often the project is compared against the state the history holds
  private static readonly checkIntervalMillis = 500;

  // how long the changes are collected before they become one step, counted from the
  // last thing the user did. Dragging a slider or typing a name changes the project
  // with every mouse move and every key stroke, which would otherwise leave one step
  // per pixel and per letter behind.
  private static readonly collectMillis = 700;

  // how long the project keeps being watched after the last thing the user did. It only
  // ever changes because of the user, so there is nothing to look for once things have
  // settled, apart from what an answered request writes into it a little later. A change
  // arriving after that is not lost, it just joins the next step.
  private static readonly watchMillis = 10000;

  // the parts of the project which are not undone, because they say what the user is
  // looking at rather than what the show is, or because they identify the project on
  // the server. They stay as they are through an undo and a redo.
  private static readonly untrackedKeys = [
    'id',
    'shareToken',
    'selectedPresetUuid',
    'selectedSceneUuids',
    'selectedStepUuid',
    'selectedCompositionUuid',
    'previewPreset',
    'stepPreviewRunning',
    'stepPreviewStartMillis',
  ];

  // everything the user can change the project with
  private static readonly interactionEvents = [
    'mousedown',
    'mousemove',
    'mouseup',
    'touchstart',
    'touchmove',
    'touchend',
    'keydown',
    'keyup',
    'input',
    'change',
    'drop',
    'dragend',
  ];

  // the states to go back to, the one an undo returns to last
  private undoSteps: string[] = [];

  // the states the undos came from, the one a redo returns to first
  private redoSteps: string[] = [];

  // the state the history knows the project to be in right now
  private currentState: string;

  // don't take the project apart while it is being put back together
  private restoring = false;

  private lastInteractionMillis = 0;

  private checkTimer: any;

  private interactionListener = () => {
    this.lastInteractionMillis = Date.now();
  };

  constructor(private projectService: ProjectService, private projectLoadService: ProjectLoadService, private ngZone: NgZone) {
    // a project which has just been loaded, created or imported starts without a history
    this.projectService.projectChanged.subscribe(() => {
      if (!this.restoring) {
        this.reset();
      }
    });

    // neither watching the project nor noticing the user has anything to show, so keep
    // both of them out of the change detection
    this.ngZone.runOutsideAngular(() => {
      for (const event of UndoService.interactionEvents) {
        document.addEventListener(event, this.interactionListener, { capture: true, passive: true });
      }

      this.checkTimer = setInterval(() => this.check(), UndoService.checkIntervalMillis);
    });
  }

  ngOnDestroy() {
    for (const event of UndoService.interactionEvents) {
      document.removeEventListener(event, this.interactionListener, { capture: true });
    }

    clearInterval(this.checkTimer);
  }

  get canUndo(): boolean {
    return this.undoSteps.length > 0;
  }

  get canRedo(): boolean {
    return this.redoSteps.length > 0;
  }

  // everything of the project an undo puts back
  private serialize(project: Project): string {
    const tracked = { ...project } as any;

    for (const key of UndoService.untrackedKeys) {
      delete tracked[key];
    }

    return JSON.stringify(tracked);
  }

  // let go of the oldest steps until the history fits again. The last one is always
  // kept, so that even a project too large for the whole history can be undone once.
  private trimHistory() {
    let characters = this.undoSteps.reduce((sum, step) => sum + step.length, 0);

    while (this.undoSteps.length > 1 && (this.undoSteps.length > UndoService.maxSteps || characters > UndoService.maxCharacters)) {
      characters -= this.undoSteps[0].length;
      this.undoSteps.shift();
    }
  }

  private check() {
    const sinceInteractionMillis = Date.now() - this.lastInteractionMillis;

    if (sinceInteractionMillis < UndoService.collectMillis || sinceInteractionMillis > UndoService.watchMillis) {
      // the user is still at it, or has long since stopped
      return;
    }

    this.captureChanges();
  }

  // turn everything changed since the last state into a step of its own. It is done on
  // its own as well, e.g. before showing whether there is anything to undo at all.
  captureChanges() {
    if (!this.projectService.project) {
      return;
    }

    const state = this.serialize(this.projectService.project);

    if (state === this.currentState) {
      return;
    }

    if (this.currentState !== undefined) {
      this.undoSteps.push(this.currentState);
      this.trimHistory();

      // a change starts a new line of edits: what has been undone before it cannot be
      // redone on top of it anymore
      this.redoSteps = [];
    }

    this.currentState = state;
  }

  // start over with the project as it is. The state it starts out with is only taken
  // once the load it comes from has run its course, because what that still does to the
  // project is part of opening it rather than the first thing the user did.
  reset() {
    this.undoSteps = [];
    this.redoSteps = [];
    this.currentState = undefined;
    this.lastInteractionMillis = Date.now();

    this.ngZone.runOutsideAngular(() => {
      setTimeout(() => this.captureChanges());
    });
  }

  private apply(state: string) {
    const data = JSON.parse(state);

    // the parts which are not undone stay as they are (see untrackedKeys)
    for (const key of UndoService.untrackedKeys) {
      data[key] = (this.projectService.project as any)[key];
    }

    this.restoring = true;

    try {
      this.projectLoadService.restoreProject(new Project(data));
    } finally {
      this.restoring = false;
    }

    // read the state back from the project rather than trusting the one written into
    // it, so that whatever a project does not carry through being read again cannot
    // look like the user changing something afterwards
    this.currentState = this.serialize(this.projectService.project);
    this.lastInteractionMillis = Date.now();
  }

  undo() {
    // whatever has been changed since the last state is a step of its own to come back to
    this.captureChanges();

    if (!this.canUndo) {
      return;
    }

    this.redoSteps.push(this.currentState);
    this.apply(this.undoSteps.pop());
  }

  redo() {
    // something changed after an undo drops everything there was to redo
    this.captureChanges();

    if (!this.canRedo) {
      return;
    }

    this.undoSteps.push(this.currentState);
    this.apply(this.redoSteps.pop());
  }
}
