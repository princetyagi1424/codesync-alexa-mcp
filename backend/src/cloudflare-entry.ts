import { httpServerHandler } from 'cloudflare:node';
import { app } from './app';

// Cloudflare Workers runs this Express application through its HTTP adapter.
// Keep the port fixed to match the official Cloudflare Express runtime pattern.
const PORT = 3000;

app.listen(PORT);

export default httpServerHandler({ port: PORT });
