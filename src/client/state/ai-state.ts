import { observable } from './observable';

export type AiMode = 'cloud' | 'local';

export interface AiState {
  mode: ReturnType<typeof observable<AiMode>>;
  result: ReturnType<typeof observable<string>>;
  loading: ReturnType<typeof observable<boolean>>;
  modelReady: ReturnType<typeof observable<boolean>>;
  modelDownloadProgress: ReturnType<typeof observable<number>>;
  consentGiven: ReturnType<typeof observable<boolean>>;
}

export const aiState: AiState = {
  mode: observable<AiMode>('cloud'),
  result: observable<string>(''),
  loading: observable<boolean>(false),
  modelReady: observable<boolean>(false),
  modelDownloadProgress: observable<number>(0),
  consentGiven: observable<boolean>(false),
};
