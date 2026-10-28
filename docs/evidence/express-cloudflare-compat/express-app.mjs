// Compatibility probe only. No database, real auth, provider call or live payment.
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({origin:'https://example.test',credentials:true}));
  app.use(cookieParser());
  // Register raw-body route before express.json so signatures cover original bytes.
  app.post('/webhook', express.raw({type:'application/json',limit:'4kb'}), (req,res) => {
    const expected = createHmac('sha256','synthetic-test-secret').update(req.body).digest();
    const supplied = Buffer.from(String(req.headers['x-test-signature'] || ''),'hex');
    if (supplied.length !== expected.length || !timingSafeEqual(supplied,expected)) return res.status(401).json({code:'BAD_SIGNATURE'});
    return res.json({verified:true,bytes:req.body.length});
  });
  app.use(express.json({limit:'4kb'}));
  app.get('/health',(_,res)=>res.json({ok:true}));
  app.get('/cookie',(_,res)=>res.cookie('first','one',{httpOnly:true,secure:true,sameSite:'lax'}).cookie('second','two',{httpOnly:true,secure:true,sameSite:'lax'}).json({ok:true}));
  const input = z.object({value:z.number().int()}).strict();
  app.post('/validated',(req,res)=>{
    const parsed=input.safeParse(req.body);
    if(!parsed.success) return res.status(422).json({code:'INVALID_INPUT'});
    return res.json({value:parsed.data.value});
  });
  app.get('/async-error',async()=>{throw new Error('synthetic private diagnostic');});
  app.get('/events',(_,res)=>{
    res.setHeader('Content-Type','text/event-stream');
    res.setHeader('Cache-Control','no-cache');
    res.write('event: state\ndata: {"stage":"review"}\n\n');
    res.end('event: done\ndata: {}\n\n');
  });
  app.use((error,req,res,next)=>res.status(500).json({code:'INTERNAL_ERROR'}));
  return app;
}
