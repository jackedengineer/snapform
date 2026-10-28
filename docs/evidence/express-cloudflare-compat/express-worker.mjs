// Bridge documented at developers.cloudflare.com/workers/tutorials/deploy-an-express-app/
import {httpServerHandler} from 'cloudflare:node';
import {createApp} from './express-app.mjs';
createApp().listen(3000);
export default httpServerHandler({port:3000});
