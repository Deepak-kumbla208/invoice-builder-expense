import type { WithSystemTx } from '../../shared/db/systemTx';

const HOUR_MS = 60 * 60 * 1000;

export const cleanupSessions = (withSystemTx: WithSystemTx) =>
  withSystemTx('session-cleanup', call => call<number>('auth_cleanup_sessions'));

export const startSessionCleanup = (withSystemTx: WithSystemTx, intervalMs = HOUR_MS) => {
  const timer = setInterval(() => {
    cleanupSessions(withSystemTx)
      .then(removed => {
        if (removed > 0) console.log(`[session-cleanup] removed ${removed} expired session(s)`);
      })
      .catch(error => console.error('[session-cleanup] failed:', error instanceof Error ? error.message : error));
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
};
