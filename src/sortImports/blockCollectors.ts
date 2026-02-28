import { BlockCollectionResult } from './types';

export function collectImportBlock(
  lines: string[],
  startIdx: number
): BlockCollectionResult | null {
  let idx = startIdx;
  const blockLines: string[] = [];

  while (idx < lines.length) {
    blockLines.push(lines[idx]);
    idx++;

    const block = blockLines.join('\n').trim();
    if (isCompleteImport(block)) {
      return { block, nextIdx: idx };
    }

    if (idx < lines.length && !lines[idx].trim()) {
      break;
    }
  }

  return null;
}

export function isFunctionLikeStart(line: string): boolean {
  return (
    line.startsWith('export const ') ||
    line.startsWith('const ') ||
    line.startsWith('export function ') ||
    line.startsWith('function ') ||
    line.startsWith('export default ') ||
    line.startsWith('export {')
  );
}

export function collectFunctionBlock(
  lines: string[],
  startIdx: number
): BlockCollectionResult | null {
  const firstLine = lines[startIdx].trim();

  if (firstLine.endsWith(';')) {
    return { block: lines[startIdx], nextIdx: startIdx + 1 };
  }

  if (!firstLine.includes('{')) {
    return null;
  }

  return collectBraceBlock(lines, startIdx);
}

export function collectBraceBlock(
  lines: string[],
  startIdx: number
): BlockCollectionResult | null {
  let idx = startIdx;
  let braceCount = 0;
  let foundOpenBrace = false;
  let block = '';

  while (idx < lines.length) {
    const currentLine = lines[idx];
    block += `${currentLine}\n`;

    for (const char of currentLine) {
      if (char === '{') {
        braceCount++;
        foundOpenBrace = true;
      } else if (char === '}') {
        braceCount--;
      }
    }

    idx++;

    if (foundOpenBrace && braceCount === 0) {
      return { block: block.trim(), nextIdx: idx };
    }
  }

  return null;
}

export function collectTypeBlock(
  lines: string[],
  startIdx: number
): BlockCollectionResult | null {
  let idx = startIdx;
  const blockLines: string[] = [];
  let braceCount = 0;
  let parenCount = 0;
  let bracketCount = 0;

  while (idx < lines.length) {
    const currentLine = lines[idx];
    blockLines.push(currentLine);

    for (const ch of currentLine) {
      if (ch === '{') braceCount++;
      else if (ch === '}') braceCount--;
      else if (ch === '(') parenCount++;
      else if (ch === ')') parenCount--;
      else if (ch === '[') bracketCount++;
      else if (ch === ']') bracketCount--;
    }

    idx++;

    const trimmed = currentLine.trim();
    const isComplete =
      braceCount <= 0 &&
      parenCount <= 0 &&
      bracketCount <= 0 &&
      (trimmed.endsWith(';') || trimmed.endsWith('}'));

    if (isComplete) {
      return { block: blockLines.join('\n').trim(), nextIdx: idx };
    }
  }

  return null;
}

function isCompleteImport(block: string): boolean {
  const normalized = block.replace(/\s+/g, ' ').trim();

  if (/^import\s+type\s+['"][^'"]+['"]\s*;?$/.test(normalized)) {
    return true;
  }

  if (/^import\s+['"][^'"]+['"]\s*;?$/.test(normalized)) {
    return true;
  }

  return /^import\b[\s\S]*\bfrom\s+['"][^'"]+['"]\s*;?$/.test(normalized);
}
