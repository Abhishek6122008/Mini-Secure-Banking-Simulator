import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createDb } from './db/client.js';

const config = loadConfig();
const { db } = createDb(config.databaseUrl);
createApp({ db, config }).listen(config.port, () => {
  console.log(`Mini Secure Banking Simulator API on http://localhost:${config.port}`);
});
