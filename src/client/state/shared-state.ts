import { observable } from './observable';

export const appState = {
  activeTab: observable<string>(''),
  overallGrade: observable<string>(''),
  completedTests: observable<string[]>([]),
  lastRunTimestamp: observable<number>(0),
};