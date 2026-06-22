import { observable } from './observable';
import type { CategoryResult } from '../adblock-test';
import type { FilterListResult } from '../filter-lists';

export const adblockState = {
  score: observable<number>(0),
  totalBlocked: observable<number>(0),
  totalTests: observable<number>(0),
  results: observable<CategoryResult[]>([]),
  categoryScores: observable<Record<string, number>>({}),
  filterLists: observable<FilterListResult[]>([]),
  loading: observable<boolean>(false),
};
