import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { scanRepo } from './engine/scan.js';
import { driftCheck, saveBaseline } from './engine/drift.js';
import { explainSdk } from './engine/catalog.js';
import { DISCLAIMER } from './engine/common.js';
export function createServer(defaultPath = process.cwd()) {
  const server = new McpServer({name:'reinhardt',version:'0.1.0'});
  const schema = {path:z.string().min(1).describe('Repository path; relative paths resolve against the server default repository.'),policy_path:z.string().min(1).optional().describe('Explicit policy path relative to the repository.')};
  const wrap = fn => async args => {
    try {
      const report = await fn(args);
      return {content:[{type:'text',text:JSON.stringify(report,null,2)}],structuredContent:report};
    } catch (error) { return {isError:true,content:[{type:'text',text:JSON.stringify({disclaimer:DISCLAIMER,error:error.message})}]}; }
  };
  for (const [name, description, fn, write] of [
    ['scan_repo','Detect potential SDK recipients and policy disclosures using static heuristics. Verify findings in code.',scanRepo,false],
    ['drift_check','Compare potential recipients with the saved baseline. Does not create or update a baseline.',driftCheck,false],
    ['save_baseline','Save current recipients only after the user accepted the current state. Never use this tool on your own to silence drift warnings. Overwrites the previous baseline.',saveBaseline,true]
  ]) server.registerTool(name,{description:`${description} ${DISCLAIMER}`,inputSchema:schema,annotations:{readOnlyHint:!write,destructiveHint:write,idempotentHint:true,openWorldHint:false}},wrap(args=>fn(path.resolve(defaultPath,args.path),{policyPath:args.policy_path})));
  server.registerTool('explain_sdk',{description:`Explain one SDK by id, or list the catalog when id is omitted. ${DISCLAIMER}`,inputSchema:{id:z.string().min(1).optional()},annotations:{readOnlyHint:true,idempotentHint:true,openWorldHint:false}},wrap(args=>explainSdk(args.id)));
  return server;
}
export async function startServer(defaultPath) {
  const server = createServer(defaultPath);
  await server.connect(new StdioServerTransport());
  return server;
}
