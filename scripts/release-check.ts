import {isIsolatedDemo} from '../server/services/demo-environment.js';
import 'dotenv/config';
import {loadConfig} from '../server/config/env.js';
import {Database} from '../server/db/pool.js';
import {releaseReady} from '../server/services/readiness.js';
import {clamScan} from '../server/services/document-scanner.js';
const config=loadConfig(),database=new Database(config);
try{
 const schema=await releaseReady(database);let scanner:'ready'|'not-configured'|'unavailable'|'isolated-demo'='not-configured';
 if(config.documentScanner.host){try{await clamScan(Buffer.from('Ootla release scanner connectivity probe.'),config.documentScanner.host,config.documentScanner.port);scanner='ready';}catch{scanner='unavailable';}}
 else if(schema&&config.demoMode&&!config.production&&await database.transaction(c=>isIsolatedDemo(config,c)))scanner='isolated-demo';
 const ready=schema&&(scanner==='ready'||scanner==='isolated-demo');console.info(JSON.stringify({ready,schema,scanner,sequenceProcessing:'Starts with the API; runs every minute with database-backed deduplication.'}));if(!ready)process.exitCode=1;
}finally{await database.close();}
