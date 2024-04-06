#!/usr/bin/env node

import chalk from 'chalk';
import { program } from 'commander';
import path from 'path';
import { fileURLToPath } from 'url';
import { cleanups } from './cleanup.js';
import { collectConfig, selectPackages } from './config.js';
import { link } from './link.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import(`${__dirname}/../../../package.json`, { assert: { type: 'json' } }).then(
  ({ default: { version } }) => {
    program.version(version).description('Links a local package into your project.');

    program
      .name('link-with')
      .description('Link local packages into current project.')
      .option('-c, --config', 'Configure linker.')
      .action(async cmd => {
        if (cmd.config) {
          collectConfig();
        } else {
          registerExitHandlers();
          try {
            const packagePaths = await selectPackages();
            await link(packagePaths, process.cwd());
          } catch (e) {
            console.error(e);
            process.exit(1);
          }
        }
      });

    program.parse(process.argv);
  }
);

function registerExitHandlers() {
  const cleanup = async () => {
    await Promise.all([...cleanups].map(fn => fn()));
    console.warn(
      chalk.yellow.inverse(
        // todo: might want to guess package manager - but for that we would need to extract "root" from Project which is resolved in the `link()`
        `\n To properly revert any changes, ${chalk.bold('yarn install --force')} or ${chalk.bold('npm install --force')} may be necessary! `
      )
    );
    process.exit();
  };
  process.on('SIGINT', cleanup);
  process.on('SIGUSR1', cleanup);
  process.on('SIGUSR2', cleanup);
  process.on('uncaughtException', e => {
    console.error('UNCAUGHT EXCEPTION!');
    console.error(e);
    return cleanup;
  });
  process.on('unhandledRejection', e => {
    console.error('UNHANDLED REJECTION!');
    console.error(e);
    return cleanup;
  });
}
