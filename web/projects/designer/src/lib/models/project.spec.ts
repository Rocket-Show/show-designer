import { Project } from './project';

// What a project keeps of what the designer doesn't know: another app's data in it (e.g. the set of a stick), saved
// again as it came
describe('Project', () => {
  const set = { compositions: [{ name: 'Opener', parts: [{ scene: 'verse' }] }] };

  it('saves what the designer does not know of again, after what it knows', () => {
    const project = new Project({ name: 'Gig', version: 11, scenes: [], emberSet: set, someHostField: 7 });
    const saved = JSON.parse(JSON.stringify(project));

    expect(saved.emberSet).toEqual(set);
    expect(saved.someHostField).toBe(7);
    expect(saved.name).toBe('Gig');

    const keys = Object.keys(saved);
    expect(keys.indexOf('emberSet')).toBeGreaterThan(keys.indexOf('fixtureFolders'));
  });

  it('keeps it through being opened and saved again, as undo does', () => {
    const project = new Project({ name: 'Gig', emberSet: set });
    const again = new Project(JSON.parse(JSON.stringify(project)));

    expect(JSON.parse(JSON.stringify(again)).emberSet).toEqual(set);
  });

  it('does not take what it knows from there: the values of the designer stay its own', () => {
    const project = new Project({ name: 'Gig', masterDimmerValue: 0.5 });
    project.masterDimmerValue = 0.8;
    project.name = 'Tour';

    const saved = JSON.parse(JSON.stringify(project));
    expect(saved.masterDimmerValue).toBe(0.8);
    expect(saved.name).toBe('Tour');
  });

  it('adds nothing to a project without anything unknown, nor to a new one', () => {
    const known = JSON.parse(JSON.stringify(new Project({ name: 'Gig' })));
    const fresh = JSON.parse(JSON.stringify(new Project()));

    expect(Object.keys(known)).toEqual(Object.keys(JSON.parse(JSON.stringify(Object.assign({}, new Project({ name: 'Gig' }))))));
    expect(fresh.emberSet).toBeUndefined();
    expect(Object.keys(fresh)).not.toContain('toJSON');
  });
});
