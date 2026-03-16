import fs from 'fs';
import path from 'path';

/**
 * Find the nearest directory upwards that contains package.json.
 * Works even if you start Node from backend/, backend/src/, etc.
 */
export function findProjectRoot(startDir = process.cwd(), maxUp = 6) {
  let dir = startDir;
  for (let i = 0; i <= maxUp; i++) {
    const pkg = path.join(dir, 'package.json');
    if (fs.existsSync(pkg)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // fallback
  return startDir;
}

export function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}
