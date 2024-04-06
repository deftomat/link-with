import { findUpSync } from 'find-up';
import path from 'path';
import { Spec, toSpecConnector } from './spec.js';

export interface Project {
  readonly root: string;
  readonly spec: Spec;
  readonly cachePath: string;
}

export function resolveProject(cwd: string): Project {
  const toCachePath = (root: string) => `${root}/node_modules/.cache/link-with`;
  const specPath = findUpSync('package.json', { cwd });
  if (specPath == null) throw Error('Invalid package');

  const specConnector = toSpecConnector(specPath);
  const project: Project = {
    root: path.dirname(specPath),
    spec: specConnector,
    cachePath: toCachePath(path.dirname(specPath))
  };
  if (specConnector.get().workspaces != null) return project;

  const parentSpecPath = findUpSync('package.json', { cwd: `${cwd}/../` });
  if (parentSpecPath == null) return project;

  const parentSpecConnector = toSpecConnector(parentSpecPath);
  if (parentSpecConnector.get().workspaces != null) {
    return {
      root: path.dirname(parentSpecPath),
      spec: parentSpecConnector,
      cachePath: toCachePath(path.dirname(parentSpecPath))
    };
  }
  return project;
}
