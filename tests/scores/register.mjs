// Lets Node load the app's own modules in the score tests: Vite resolves
// "./dateFormatter" to dateFormatter.js, and this does the same for Node.
import { register } from 'node:module';

register('./resolve-js.mjs', import.meta.url);

// Every browser a test starts is silent (Tim, 16 Nov): tests/mute-audio.mjs.
await import('../mute-audio.mjs');
