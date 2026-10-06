import { createInterface } from 'node:readline';
import { DISCLAIMER } from './engine/common.js';
import { toolDefinitions, validArguments, toolError } from './mcp-tools.js';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const rpcError = (id, code, message) => ({jsonrpc:'2.0',id,error:{code,message,data:{disclaimer:DISCLAIMER}}});
export function createServer(defaultPath = process.cwd()) {
  const tools = toolDefinitions(defaultPath);
  return {
    async handle(message) {
      if (!object(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string') return rpcError(message?.id ?? null,-32600,'Invalid Request');
      // Notifications are one-way, including unknown notification methods.
      if (!Object.hasOwn(message,'id')) return null;
      const {id,method,params} = message;
      if (id !== null && typeof id !== 'string' && typeof id !== 'number') return rpcError(null,-32600,'Invalid Request');
      if (params !== undefined && !object(params)) return rpcError(id,-32602,'Invalid params');
      let result;
      switch (method) {
        case 'initialize':
          if (!object(params) || typeof params.protocolVersion !== 'string') return rpcError(id,-32602,'Invalid params');
          result = {protocolVersion:params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'reinhardt',version:'0.4.0'},instructions:DISCLAIMER};
          break;
        case 'ping': result = {}; break;
        case 'tools/list': result = {tools:tools.map(({call,...definition})=>definition)}; break;
        case 'tools/call': {
          if (!object(params) || typeof params.name !== 'string' || (params.arguments !== undefined && !object(params.arguments))) return rpcError(id,-32602,'Invalid params');
          const tool = tools.find(tool=>tool.name === params.name);
          if (!tool) return rpcError(id,-32602,'Unknown tool');
          const args = params.arguments ?? {};
          if (!validArguments(args,tool.inputSchema)) result = toolError('Invalid tool arguments');
          else {
            try {
              const report = await tool.call(args);
              result = {content:[{type:'text',text:JSON.stringify(report,null,2)}],structuredContent:report};
            } catch {
              // Filesystem errors can contain absolute paths; parse errors can
              // contain source text. Neither is appropriate for an MCP response.
              result = toolError('Tool failed: check the requested path, identifier, and readable input files.');
            }
          }
          break;
        }
        default: return rpcError(id,-32601,'Method not found');
      }
      return {jsonrpc:'2.0',id,result};
    }
  };
}
export async function startServer(defaultPath = process.cwd()) {
  const server = createServer(defaultPath);
  const lines = createInterface({input:process.stdin,crlfDelay:Infinity});
  for await (const line of lines) {
    if (!line.trim()) continue;
    let message, response;
    try { message = JSON.parse(line); }
    catch { response = rpcError(null,-32700,'Parse error'); }
    if (!response) {
      try { response = await server.handle(message); }
      catch { response = rpcError(null,-32603,'Internal error'); }
    }
    if (response) process.stdout.write(JSON.stringify(response)+'\n');
  }
  return server;
}
