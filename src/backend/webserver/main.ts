import { pool } from '../shared/db/pool';
import { withSystemTx } from '../shared/db/systemTx';
import { createApp } from './app';
import { APP_CONFIG } from './config';
import { createServerDeps } from './deps';
import { startSessionCleanup } from './jobs/sessionCleanup';

const port = Number(process.env.PORT) || Number(APP_CONFIG.PORT);
const host = process.env.HOST || APP_CONFIG.HOST;

const app = createApp(createServerDeps(pool));
startSessionCleanup(withSystemTx);

app.listen(port, host, error => {
  if (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
  console.log(`Server listening on ${host}:${port}`);
});
