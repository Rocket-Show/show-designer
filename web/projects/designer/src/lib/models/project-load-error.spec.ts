import { HttpErrorResponse } from '@angular/common/http';

import deTranslations from '../../../../../src/assets/designer/i18n/de.json';
import enTranslations from '../../../../../src/assets/designer/i18n/en.json';
import esTranslations from '../../../../../src/assets/designer/i18n/es.json';
import frTranslations from '../../../../../src/assets/designer/i18n/fr.json';
import itTranslations from '../../../../../src/assets/designer/i18n/it.json';
import ptTranslations from '../../../../../src/assets/designer/i18n/pt.json';
import zhTranslations from '../../../../../src/assets/designer/i18n/zh.json';
import { getProjectLoadError } from './project-load-error';

// What the user is told about a project which could not be opened.
describe('getProjectLoadError', () => {
  it('passes on the error the server answered with', () => {
    const response = new HttpErrorResponse({ status: 404, error: { error: 'not-found' } });

    expect(getProjectLoadError(response)).toEqual({ message: 'designer.project.open-error', details: 'not-found' });
  });

  it('asks a user without the permission to have the project shared', () => {
    const response = new HttpErrorResponse({ status: 403, error: { error: 'no-permission' } });

    expect(getProjectLoadError(response)).toEqual({ message: 'designer.project.open-no-permission', details: undefined });
  });

  it("says it doesn't know, where the server didn't say", () => {
    expect(getProjectLoadError(new HttpErrorResponse({ status: 0 })).details).toBe('unknown');
  });

  it('passes on what the designer itself found wrong with the project', () => {
    const error = new Error('The project version 11 is created with a newer version of the designer.');

    expect(getProjectLoadError(error)).toEqual({
      message: 'designer.project.open-error',
      details: 'The project version 11 is created with a newer version of the designer.',
    });
    expect(getProjectLoadError(undefined).details).toBe('unknown');
  });

  it('only names messages there is a translation for', () => {
    const messages = [
      getProjectLoadError(new HttpErrorResponse({ error: { error: 'no-permission' } })).message,
      getProjectLoadError(new Error()).message,
    ];

    for (const translations of [
      deTranslations,
      enTranslations,
      esTranslations,
      frTranslations,
      itTranslations,
      ptTranslations,
      zhTranslations,
    ]) {
      for (const message of messages) {
        const translated = message.split('.').reduce((parent: any, key) => parent && parent[key], translations);

        expect(typeof translated).toBe('string', message);
      }
    }
  });
});
