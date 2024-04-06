import { outputJSONSync, readJSONSync } from 'fs-extra/esm';
import { Package } from './package.js';
import { Project, resolveProject } from './project.js';

function toStateFilePath(project: Project) {
  return `${project.cachePath}/state.json`;
}

export function markAsLinked(packages: Package[], project: Project) {
  const state: { linkedPackages: LinkedPackage[] } = {
    linkedPackages: packages.map(pkg => ({ name: pkg.name, root: pkg.root }))
  };

  outputJSONSync(toStateFilePath(project), state, { spaces: 2 });
}

/**
 * Returns the currently linked packages.
 */
export function getLinkedPackages(cwd = process.cwd()): LinkedPackage[] {
  const project = resolveProject(cwd);

  try {
    const state = readJSONSync(toStateFilePath(project));
    return state.linkedPackages;
  } catch (e) {
    return [];
  }
}

export interface LinkedPackage {
  readonly name: string;
  readonly root: string;
}
