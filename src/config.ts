import chalk from 'chalk';
import Configstore from 'configstore';
import { readJson } from 'fs-extra/esm';
import { readdirSync } from 'node:fs';
import inquirer from 'inquirer';
import autocomplete from 'inquirer-checkbox-autocomplete-prompt';
import fileTreeSelection from 'inquirer-file-tree-selection-prompt';
import { homedir } from 'os';

const storeName = 'deftomat.link-with';

export interface Config {
  readonly packagesRoots: string[];
}

export async function getConfig(): Promise<Config> {
  const defaultConfig: Config = { packagesRoots: [] };
  return new Configstore(storeName, defaultConfig).all;
}

export async function collectConfig(): Promise<void> {
  inquirer.registerPrompt('file-tree-selection', fileTreeSelection);

  const { packagesRoots } = await inquirer.prompt([
    {
      type: 'file-tree-selection',
      message: 'Select packages root directory',
      name: 'packagesRoots',
      root: homedir(),
      onlyShowDir: true,
      pageSize: 16,
      multiple: true,
      onlyShowValid: true,
      validate: (path: string) => !path.includes('/.')
    }
  ]);

  if (packagesRoots.length === 0) {
    console.error(chalk.red('You need to select at least one directory!'));
    process.exit(1);
  }

  const config: Config = { packagesRoots };
  new Configstore(storeName).all = config;

  console.info(chalk.green('Configuration successfully updated.'));
}

export async function selectPackages(): Promise<string[]> {
  const { packagesRoots } = await getConfig();

  const packages = await findAllPackages(packagesRoots);

  if (packages.length === 0) {
    console.warn(
      chalk.yellow(
        'No packages to link! Please update the configuration accordingly using "-c" option.'
      )
    );
    process.exit(1);
  }

  inquirer.registerPrompt('checkbox-autocomplete', autocomplete);

  const { selected } = await inquirer.prompt([
    {
      type: 'checkbox-autocomplete',
      message: 'Select package(s)',
      name: 'selected',
      asyncSource: async (_, input) => {
        return packages
          .filter(pkg => includesParts(input, pkg.name))
          .map(pkg => ({ name: pkg.name, value: pkg.root }));
      },
      pageSize: 16,
      validate: answer => {
        if (answer.length < 1) {
          return 'You must choose at least one package.';
        }
        return true;
      }
    }
  ]);

  return selected;
}

async function findAllPackages(packagesRoots: string[]) {
  const packages = await Promise.all(
    packagesRoots.flatMap(root =>
      readdirSync(root).map(async name => {
        const pkgRoot = `${root}/${name}`;

        try {
          const manifest = await readJson(`${pkgRoot}/package.json`);

          return { name: manifest.name, root: pkgRoot };
        } catch (e) {
          if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return;
          throw e;
        }
      })
    )
  );

  return packages.filter(isNotNil).sort((a, b) => a.name.localeCompare(b.name));
}

function includesParts(query: string, string: string): boolean {
  if (query == null) return true;
  const normalizedTarget = string.toLowerCase();
  const parts = query.toLowerCase().split(' ');

  return parts.every(part => normalizedTarget.includes(part));
}

function isNotNil<T>(value: T | null | undefined): value is T {
  return value != null;
}
