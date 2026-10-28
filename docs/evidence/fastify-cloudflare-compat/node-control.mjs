import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import swagger from '@fastify/swagger';

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
await app.listen({host:'127.0.0.1',port:8790});
