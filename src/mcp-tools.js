import path from 'node:path';
import { scanRepo } from './engine/scan.js';
import { driftCheck, saveBaseline } from './engine/drift.js';
import { explainSdk } from './engine/catalog.js';
import { lookup } from './engine/owasp.js';
import { listRules } from './engine/rules.js';
import { DISCLAIMER } from './engine/common.js';

const string = description => ({type:'string',minLength:1,description});
const schema = (properties, required = []) => ({type:'object',properties,required,additionalProperties:false});
const repositorySchema = schema({path:string('Repository path; relative to the server default repository.'),policy_path:string('Explicit policy path relative to the repository.')},['path']);
export function toolDefinitions(defaultPath) {
  const repository = fn => args => fn(path.resolve(defaultPath,args.path),{policyPath:args.policy_path});
  return [
    ['scan_repo','Detect potential SDK recipients, policy disclosures, and OWASP-mapped security findings. Verify in code.',repositorySchema,repository(scanRepo),false],
    ['drift_check','Compare potential recipients with the saved baseline. Does not create or update a baseline.',repositorySchema,repository(driftCheck),false],
    ['save_baseline','Save current recipients only after the user accepted the current state. Never use this tool on your own to silence drift warnings. Overwrites the previous baseline.',repositorySchema,repository(saveBaseline),true],
    ['explain_sdk','Explain one SDK by id, or list the catalog when id is omitted.',schema({id:string('SDK id.')}),args=>explainSdk(args.id),false],
    ['owasp_lookup','Look up OWASP standards, items, CWE references, or terminology.',schema({query:string('Reference, standard id, item id, CWE, or search text.')}),args=>lookup(args.query),false],
    ['list_rules','List security rules or explain one rule without test vectors.',schema({id:string('Rule id.')}),args=>listRules(args.id),false]
  ].map(([name,description,inputSchema,call,write])=>({name,description:`${description} ${DISCLAIMER}`,inputSchema,annotations:{readOnlyHint:!write,destructiveHint:write,idempotentHint:true,openWorldHint:false},call}));
}
export function validArguments(input, schema) {
  return input !== null && typeof input === 'object' && !Array.isArray(input)
    && schema.required.every(key=>Object.hasOwn(input,key))
    && Object.entries(input).every(([key,value])=>Object.hasOwn(schema.properties,key) && typeof value === 'string' && value.length >= 1);
}
export const toolError = message => ({isError:true,content:[{type:'text',text:JSON.stringify({disclaimer:DISCLAIMER,error:message})}]});
