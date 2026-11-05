import { HttpErrorResponse } from '@angular/common/http';

// what the user is told about a project which could not be opened: the message to translate
// and the details of what went wrong, if there are any worth showing
export interface ProjectLoadError {
  message: string;
  details: string;
}

// the error of a project which could not be opened, out of what the loading failed with: the
// answer of the server, or an error of the designer itself (e.g. a project of a newer version)
export function getProjectLoadError(response: any): ProjectLoadError {
  if (response instanceof HttpErrorResponse) {
    const error = response.error ? response.error.error : 'unknown';

    if (error === 'no-permission') {
      return { message: 'designer.project.open-no-permission', details: undefined };
    }

    return { message: 'designer.project.open-error', details: error };
  }

  return { message: 'designer.project.open-error', details: response && response.message ? response.message : 'unknown' };
}
