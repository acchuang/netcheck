import { SpeedTest, type SpeedTestResults } from './speed-test';
import { SpeedTestHistory } from './history';
import { t } from './i18n';
import { announce } from './a11y';

export type MonitorDuration = 5 | 10 | 30;

interface MonitorState {
  running: boolean;
  duration: MonitorDuration;
  testsCompleted: number;
  testsTotal: number;
  startedAt: number;
  abortController: AbortController;
}

export const SpeedMonitor = {
  state: null as MonitorState | null,

  _pacingFor(duration: MonitorDuration, testIndex: number): number {
    if (testIndex <= 3) return 10_000;
    if (testIndex <= 10) return 30_000;
    const remaining = duration * 60_000 - 250_000;
    const remainingTests = this._totalTests(duration) - 10;
    return Math.max(remaining / Math.max(remainingTests, 1), 30_000);
  },

  _totalTests(duration: MonitorDuration): number {
    return duration === 5 ? 10 : duration === 10 ? 16 : 25;
  },

  async start(
    duration: MonitorDuration,
    onResult: (r: SpeedTestResults, index: number) => void,
  ): Promise<void> {
    if (this.state?.running) return;
    const totalTests = this._totalTests(duration);
    const startedAt = Date.now();
    const abortController = new AbortController();

    this.state = {
      running: true,
      duration,
      testsCompleted: 0,
      testsTotal: totalTests,
      startedAt,
      abortController,
    };

    announce(t('speed.monitorStarted', duration));
    onResult(null as unknown as SpeedTestResults, 0);

    try {
      for (let i = 1; i <= totalTests; i++) {
        if (abortController.signal.aborted) break;
        if (i > 1) await new Promise((r) => setTimeout(r, this._pacingFor(duration, i)));

        if (abortController.signal.aborted) break;
        this.state.testsCompleted = i;
        try {
          const result = await SpeedTest.run(() => {});
          SpeedTestHistory.save(result);
          onResult(result, i);
        } catch {
          /* skip failed iteration, continue monitoring */
        }
      }
    } finally {
      this.state = null;
      announce(t('speed.monitorComplete'));
    }
  },

  stop(): void {
    this.state?.abortController.abort();
    this.state = null;
  },
};
