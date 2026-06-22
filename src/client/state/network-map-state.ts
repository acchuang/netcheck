import { observable } from './observable';
import type { MapResults } from '../network-map';

export const networkMapState = {
  results: observable<MapResults | null>(null),
  loading: observable<boolean>(false),
};
