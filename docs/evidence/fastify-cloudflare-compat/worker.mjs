import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import swagger from '@fastify/swagger';
import { httpServerHandler } from 'cloudflare:node';

const app = Fastify({logger: false});
app.register(cookie);
app.register(cors, {origin: 'https://example.test', credentials: true});
app.register(helmet);
app.register(swagger, {openapi: {info: {title: 'Local compatibility spike',version:'0'}}});
app.get('/health', async () => ({ok: true}));
app.get('/cookie', async (_, reply) => reply.setCookie('first','one',{httpOnly:true}).setCookie('second','two',{httpOnly:true}).send({ok:true}));
app.post('/validated', {
  schema: {body: {type:'object',required:['value'],additionalProperties:false,properties:{value:{type:'integer'}}},response:{200:{type:'object',properties:{value:{type:'integer'}}}}}
}, async (req) => ({value:req.body.value}));
const handler = httpServerHandler(app.server);
export default {
  async fetch(request, env, ctx) {
    await app.ready();
    return handler.fetch(request, env, ctx);
  }
};
