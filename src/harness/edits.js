import path from 'node:path';

export function editedPaths(input) {
  const tool = input.tool_input ?? {};
  let paths = [];
  if (['Edit', 'Write', 'MultiEdit'].includes(input.tool_name) && typeof tool.file_path === 'string') paths = [tool.file_path];
  if (input.tool_name === 'apply_patch') {
    const patch = [tool.command, tool.input, tool.patch].find(value => typeof value === 'string') ?? '';
    paths = [...patch.matchAll(/^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)\r?$/gm)].map(match => match[1].trim());
  }
  const root = path.resolve(input.cwd);
  return [...new Set(paths.map(file => path.relative(root, path.resolve(root, file)))
    .filter(file => file && file !== '..' && !file.startsWith(`..${path.sep}`) && !path.isAbsolute(file))
    .map(file => file.split(path.sep).join('/')))].sort();
}
