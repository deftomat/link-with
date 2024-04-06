import chalk from 'chalk';
import chokidar, { FSWatcher } from 'chokidar';
import { ExecaChildProcess } from 'execa';
import fsExtra from 'fs-extra/esm';
import ora from 'ora';
import path from 'path';
import { cleanups } from './cleanup.js';
import { renderCompilationWarning } from './helpers.js';
import { Package, resolvePackage } from './package.js';
import {
  toDependencyInstaller,
  toInstallCommand,
  toLockFile,
  updateProjectSpec as toUpdatedProjectSpec,
  triggerRebuild
} from './packageManager.js';
import { Project, resolveProject } from './project.js';
import { markAsLinked } from './state.js';

export async function link(packagePaths: string[], cwd: string) {
  let firstInstallation = true;
  let currentInstallation: Installation | null = null;

  console.clear();
  const project = resolveProject(cwd);

  cleanups.add(() => fsExtra.remove(project.cachePath));

  const packages = packagePaths.map(resolvePackage);
  const syncer = createSyncer(packages, project);

  await ensureDependencyOn(packages, project);

  const specsToWatch = packages.map(pkg => pkg.spec.path);
  chokidar.watch(specsToWatch).on('change', installAndSync);

  installAndSync();

  async function installAndSync() {
    /* eslint-disable require-atomic-updates */
    if (currentInstallation == null) {
      syncer.stop();
      if (firstInstallation === false) console.clear();
      firstInstallation = false;
      currentInstallation = installPackages(packages, project);
      const result = await currentInstallation.result;
      if (result === 'success') {
        syncer.start();
      }
      currentInstallation = null;
    } else {
      await currentInstallation.cancel();
      currentInstallation = null;
      installAndSync();
    }
    /* eslint-enable require-atomic-updates */
  }
}

async function ensureDependencyOn(packages: Package[], project: Project) {
  const spinner = ora({ text: chalk.cyan('Checking project dependencies') }).start();
  const lockFile = await toLockFile(project);

  try {
    await Promise.all(
      packages.map(({ name }) => {
        if (!lockFile.includes(name)) {
          throw Error(
            chalk.yellow(`${chalk.bold(name)} is not a project's dependency!\n`) +
              `Please add this package as dependency and run ${chalk.bold(toInstallCommand(project))}.`
          );
        }
      })
    );
  } catch (e) {
    spinner.fail(e.message);
    process.exit(1);
  }

  spinner.succeed();
}

function installPackages(packages: Package[], project: Project): Installation {
  let childProcess: ExecaChildProcess;
  const spinner = ora({ text: chalk.cyan('Installing transitive dependencies') }).start();

  return {
    result: run(),
    cancel: async () => {
      childProcess.cancel();
      await childProcess.catch(() => null);
    }
  };

  async function run(): Promise<InstallationResult> {
    const cleanup = () => project.spec.revert();
    cleanups.add(cleanup);

    try {
      const resolutions = copyPackagesToCache(packages, project);

      project.spec.set(toUpdatedProjectSpec({ project, resolutions }));

      childProcess = toDependencyInstaller(project);
      await childProcess;

      cleanups.delete(cleanup);
      cleanup();
      spinner.succeed();
      return 'success';
    } catch (e) {
      cleanups.delete(cleanup);
      cleanup();

      if (e.isCanceled) {
        spinner.fail('Installation aborted due to change in package manifest.');
        return 'canceled';
      }

      spinner.fail('Installation failed with the following error:');
      console.error(e.message);
      console.info(
        chalk.yellow.inverse(
          "Process will try to reinstall transitive dependencies on next change in linked package's manifest."
        )
      );

      return 'error';
    }
  }
}

interface Installation {
  cancel(): Promise<void>;
  readonly result: Promise<InstallationResult>;
}

type InstallationResult = 'success' | 'canceled' | 'error';

function createSyncer(packages: Package[], project: Project) {
  let watchers: FSWatcher[] = [];

  return {
    start() {
      if (watchers.length > 0) return;

      watchers = packages.map(pkg =>
        chokidar
          .watch(pkg.root, { ignored: toWatchIgnoredPaths(pkg) })
          .on('all', (event, eventPath) => {
            if (eventPath === pkg.root) return;

            const relativeEventPath = path.relative(pkg.root, eventPath);
            const target = `${project.root}/node_modules/${pkg.name}/${relativeEventPath}`;

            switch (event) {
              case 'add':
              case 'change':
                fsExtra.copy(eventPath, target).catch(console.error);
                break;
              case 'addDir':
                fsExtra.ensureDir(target).catch(console.error);
                break;
              case 'unlink':
              case 'unlinkDir':
                fsExtra.remove(target).catch(console.error);
                break;
              default:
                throw Error('Unexpected FS event!');
            }
            triggerRebuild(project);
          })
      );

      markAsLinked(packages, project);
      console.info('🚧 Keeping packages in sync...');
      renderCompilationWarning();
    },
    stop() {
      watchers.forEach(watcher => watcher.close());
      watchers = [];
      markAsLinked([], project);
    }
  };
}

function toWatchIgnoredPaths(pkg: Package) {
  // TODO: read .npmignore or .gitignore
  // TODO: read "files" property in package's spec
  // TODO: make sure you restart watchers when .ignore files change
  return [pkg.spec.path, '**/.git/**', '**/node_modules/**'];
}

function copyPackagesToCache(
  packages: Package[],
  project: Project
): { [packageName: string]: string } {
  fsExtra.removeSync(project.cachePath);

  const resolutions = packages.reduce(
    (result, pkg) => ({ ...result, [pkg.name]: `${project.cachePath}/${pkg.name}` }),
    {}
  );

  // todo: copy only non-ignored files & package.json
  packages.forEach(pkg => {
    fsExtra.copySync(pkg.root, resolutions[pkg.name], {
      filter: (src, des) => !src.includes('/node_modules') && !src.includes('/.git')
    });
  });

  return resolutions;
}
