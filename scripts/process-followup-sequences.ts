import {loadConfig,assertOotlaDatabase} from '../server/config/env.js';
import {Database} from '../server/db/pool.js';
import {FollowupSequences} from '../server/services/followup-sequences.js';
const config=loadConfig();assertOotlaDatabase(config);const db=new Database(config);
try{await db.requireReady();console.info(JSON.stringify(await new FollowupSequences(db,config).tick()));}
catch{console.error('Follow-up sequence processing failed. Check database availability and migrations.');process.exitCode=1;}
finally{await db.close();}
