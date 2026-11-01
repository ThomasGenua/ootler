import type {Response} from 'express';
import type {Database} from '../db/pool.js';
import {scanDocument} from '../services/document-scanner.js';
import {validateDocument} from '../services/lead-workspace.js';
/** Authorization must finish in the owning service before passing a file here. */
export async function previewDocument(response:Response,database:Database,file:{name:string;mediaType:string;content:Buffer}){
 validateDocument(file.name,file.mediaType,file.content);
 const engine=await database.transaction(c=>scanDocument(database.config,c,file.content));
 response.setHeader('Content-Type',file.mediaType);response.setHeader('Content-Disposition',"inline; filename*=UTF-8''"+encodeURIComponent(file.name));
 response.setHeader('Cache-Control','no-store, private');response.setHeader('Referrer-Policy','no-referrer');response.setHeader('X-Content-Type-Options','nosniff');response.setHeader('X-Document-Scan',engine);
 response.setHeader('Content-Security-Policy',"default-src 'none'; sandbox; frame-ancestors 'none'");response.send(file.content);
}
