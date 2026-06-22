import { observable } from './observable';

export const breachState = {
  found: observable<boolean>(false),
  count: observable<number>(0),
  error: observable<string | null>(null),
  loading: observable<boolean>(false),
};
