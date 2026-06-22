import { describe, it, expect } from 'vitest';
import { appState } from '../state/shared-state';

describe('appState', () => {
  it('has overall grade observable starting as empty string', () => {
    expect(appState.overallGrade.get()).toBe('');
  });

  it('has completedTests as an empty array initially', () => {
    expect(appState.completedTests.get()).toEqual([]);
  });

  it('has activeTab observable starting as empty string', () => {
    expect(appState.activeTab.get()).toBe('');
  });
});
