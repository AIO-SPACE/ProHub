import { createServer } from 'node:http';
import { createApp } from './app.js';
import { downloadHealth } from './services/downloads/downloadService.js';
import { store } from './store.js';

const port = Number(process.env.PORT || process.env.PROHUB_API_PORT || 4173);
const host = process.env.HOST || '127.0.0.1';

await downloadHealth(store).catch((error) => {
  console.warn(`Download engine startup warning: ${error.message}`);
});

const server = createServer(createApp({ store }));

server.listen(port, host, () => {
  console.log(`ProHub backend alive at http://${host}:${port}`);
  console.log(`Health check: http://${host}:${port}/api/health`);
});
