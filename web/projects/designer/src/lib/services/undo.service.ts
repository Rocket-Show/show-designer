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

  // how long the project is given to come to a rest before it is looked at. A click is
  // only handled once the button comes up, and what it changes can travel through a
  // handler or two before it lands in the project; a project which has just been loaded
  // gets the positions the preview calculates for its fixtures written into it on the
  // first frame it is drawn in.
  private static readonly settleMillis = 250;

  // how long the changes of the keyboard are collected. Typing a name changes the
  // project with every key stroke, which would otherwise leave one step per letter
  // behind.
  private static readonly typingMillis = 700;

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

  // a gesture of the pointer starts here. Everything it changes belongs to one step,
  // no matter how many values it moves on the way.
  private static readonly gestureStartEvents = ['mousedown', 'touchstart'];

  // and ends here, which is where that step is cut
  private static readonly gestureEndEvents = ['mouseup', 'touchend', 'touchcancel', 'drop', 'dragend'];

  // the keyboard changes the project without a gesture around it
  private static readonly typingEvents = ['keydown', 'keyup', 'input', 'change'];

  // the states to go back to, the one an undo returns to last
  private undoSteps: string[] = [];

  // the states the undos came from, the one a redo returns to first
  private redoSteps: string[] = [];

  // the state the history knows the project to be in right now
  private currentState: string;

  // don't take the project apart while it is being put back together
  private restoring = false;

  // is a gesture of the pointer running? Nothing is cut into a step while it is.
  private pointerDown = false;

  private captureTimer: any;

  private gestureStartListener = () => {
    // whatever was changed before this gesture belongs to the step before it
    this.capturePending();
    this.pointerDown = true;
  };

  private gestureEndListener = () => {
    this.pointerDown = false;
    this.scheduleCapture(UndoService.settleMillis);
  };

  private typingListener = () => {
    this.scheduleCapture(UndoService.typingMillis);
  };

  constructor(private projectService: ProjectService, private projectLoadService: ProjectLoadService, private ngZone: NgZone) {
    // a project which has just been loaded, created or imported starts without a history
    this.projectService.projectChanged.subscribe(() => {
      if (!this.restoring) {
        this.reset();
      }
    });

    // neither noticing the user nor looking at the project has anything to show, so
    // keep both of them out of the change detection
    this.ngZone.runOutsideAngular(() => {
      this.eachInteractionEvent((event, listener) => document.addEventListener(event, listener, { capture: true, passive: true }));
    });
  }

  ngOnDestroy() {
    this.eachInteractionEvent((event, listener) => document.removeEventListener(event, listener, { capture: true }));

    clearTimeout(this.captureTimer);
  }

  private eachInteractionEvent(each: (event: string, listener: () => void) => void) {
    for (const event of UndoService.gestureStartEvents) {
      each(event, this.gestureStartListener);
    }

    for (const event of UndoService.gestureEndEvents) {
      each(event, this.gestureEndListener);
    }

    for (const event of UndoService.typingEvents) {
      each(event, this.typingListener);
    }
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

  // look at the project once the user has come to a rest
  private scheduleCapture(delayMillis: number) {
    clearTimeout(this.captureTimer);

    this.captureTimer = setTimeout(() => {
      this.captureTimer = undefined;

      // a gesture which is still running becomes a step of its own once it is over
      if (!this.pointerDown) {
        this.capture();
      }
    }, delayMillis);
  }

  // cut the step which is waiting to be cut, if there is one
  private capturePending() {
    if (this.captureTimer) {
      this.captureChanges();
    }
  }

  // turn everything changed since the last state into a step of its own, right now.
  // It is done on its own as well, e.g. before showing whether there is anything to
  // undo at all.
  captureChanges() {
    clearTimeout(this.captureTimer);
    this.captureTimer = undefined;

    this.capture();
  }

  private capture() {
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

    this.ngZone.runOutsideAngular(() => this.scheduleCapture(UndoService.settleMillis));
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
