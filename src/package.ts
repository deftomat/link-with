import chalk from 'chalk';
import { existsSync } from 'fs';
import validatePackageName from 'validate-npm-package-name';
import { Spec, toSpecConnector } from './spec.js';

export interface Package {
  readonly name: string;
  readonly root: string;
  readonly spec: Spec;
}

export function resolvePackage(packagePath: string): Package {
  const specPath = `${packagePath}/package.json`;
  if (!existsSync(specPath)) {
    throw Error(`${chalk.bold(packagePath)} is not a package!`);
  }
  const specConnector = toSpecConnector(specPath);
  const spec = specConnector.get();

  if (!isPackageName(spec.name)) {
    throw Error(`${chalk.bold(spec.name)} is not a valid package name!`);
  }

  return {
    name: spec.name,
    root: packagePath,
    spec: specConnector
  };
}

function isPackageName(name: string): boolean {
  const result = validatePackageName(name);
  return result.validForNewPackages;
}
