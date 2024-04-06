import { execa } from 'execa';
import fs from 'fs';
import { existsSync } from 'node:fs';
import { utimes } from 'node:fs/promises';
import { isNotNil, mergeDeepRight } from 'ramda';
import { Project } from './project.js';

export function updateProjectSpec(props: {
  project: Project;
  resolutions: {
    [packageName: string]: string;
  };
}) {
  if (usesYarn(props.project))
    return mergeDeepRight(props.project.spec.get(), { resolutions: props.resolutions });

  if (usesNpm(props.project)) {
    const { dependencies = {}, devDependencies = {}, ...rest } = props.project.spec.get();
    const packageNames = Object.keys(props.resolutions);

    return mergeDeepRight(
      {
        ...rest,
        dependencies: removeDependencies({ dependencies, packageNames }),
        devDependencies: removeDependencies({ dependencies: devDependencies, packageNames })
      },
      {
        overrides: props.resolutions
      }
    );
  }

  throw Error(`Unexpected package manager.`);
}

function removeDependencies(props: {
  dependencies: { [packageName: string]: string };
  packageNames: string[];
}): any {
  return Object.fromEntries(
    Object.entries(props.dependencies)
      .map(([packageName, value]) =>
        props.packageNames.includes(packageName) ? undefined : [packageName, value]
      )
      .filter(isNotNil)
  );
}

export function toDependencyInstaller(project: Project) {
  if (usesYarn(project))
    return execa('yarn', ['install', '--force', '--pure-lockfile', '--non-interactive']);
  if (usesNpm(project)) return execa('npm', ['install', '--force', '--silent']);

  throw Error(`Unexpected package manager.`);
}

let touchTimeout: NodeJS.Timeout;
export function triggerRebuild(project: Project) {
  clearTimeout(touchTimeout);
  touchTimeout = setTimeout(async () => {
    const now = new Date();
    await utimes(toRebuildTrigger(project), now, now);
  }, 300);
}

export async function toLockFile(project: Project): Promise<string> {
  if (usesYarn(project))
    return (await fs.promises.readFile(`${project.root}/yarn.lock`)).toString();

  if (usesNpm(project))
    return (await fs.promises.readFile(`${project.root}/package-lock.json`)).toString();

  throw Error(`Unexpected package manager.`);
}

export function toInstallCommand(project: Project): string {
  if (usesYarn(project)) return 'yarn install';
  if (usesNpm(project)) return 'npm install';

  throw Error(`Unexpected package manager.`);
}

function toRebuildTrigger(project: Project) {
  if (usesYarn(project))
    // If any build tool is watching for changes in node_modules/.yarn-integrity
    // then we want to trigger the rebuild.
    return `${project.root}/node_modules/.yarn-integrity`;

  // todo: this might be unnecessary https://g.co/gemini/share/80a7a0fc5128
  if (usesNpm(project)) return `${project.root}/package-lock.json`;

  throw Error(`Unexpected package manager.`);
}

function usesNpm(project: Project): boolean {
  return existsSync(`${project.root}/package-lock.json`);
}

function usesYarn(project: Project): boolean {
  return existsSync(`${project.root}/yarn.lock`);
}
