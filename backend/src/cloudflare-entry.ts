import { httpServerHandler } from 'cloudflare:node';
import { app } from './index';

// Cloudflare uses this port as an internal routing key, not a public TCP port.
const PORT = 3000;
app.listen(PORT);

export default httpServerHandler({ port: PORT });
