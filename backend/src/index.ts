import 'dotenv/config';
import { app } from './app';

const PORT = process.env.PORT
  ? Number(process.env.PORT)
  : process.env.NODE_ENV === 'production'
    ? 3000
    : 5000;

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error(`Invalid PORT configuration: ${process.env.PORT}`);
}

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`CodeSync AI Backend v2.0 started on port ${PORT}`);
});

server.on('error', (error: NodeJS.ErrnoException) => {
  console.error('[Startup Error]', error.message);
  process.exit(1);
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
