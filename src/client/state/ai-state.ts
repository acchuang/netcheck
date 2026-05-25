import { observable } from './observable';

export type AiMode = 'cloud' | 'local';

export interface AiState {
  mode: ReturnType<typeof observable<AiMode>>;
  result: ReturnType<typeof observable<string>>;
  loading: ReturnType<typeof observable<boolean>>;
  modelReady: ReturnType<typeof observable<boolean>>;
  modelDownloadProgress: ReturnType<typeof observable<number>>;
  modelConfirming: ReturnType<typeof observable<boolean>>;
  consentGiven: ReturnType<typeof observable<boolean>>;
}

export const aiState: AiState = {
  mode: observable<AiMode>('cloud'),
  result: observable<string>(''),
  loading: observable<boolean>(false),
  modelReady: observable<boolean>(false),
  modelDownloadProgress: observable<number>(0),
  modelConfirming: observable<boolean>(false),
  consentGiven: observable<boolean>(false),
};
