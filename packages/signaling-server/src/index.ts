import { readConfig } from './config.ts';
import { createSignalingServer } from './server.ts';

const config = readConfig();
const port = await createSignalingServer(config).listen(config.port);
console.log(`Signaling server listening on port ${port}`);
