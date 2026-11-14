import 'dotenv/config';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createDb } from './db/client.js';

const config = loadConfig();
const { db } = createDb(config.databaseUrl);
const app = createApp({ db, config });

app.listen(config.port, '0.0.0.0', () => {
  console.log(
    `Mini Secure Banking Simulator API on http://localhost:${config.port}`
  );
});
