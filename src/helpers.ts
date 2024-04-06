import chalk from 'chalk';

export function renderCompilationWarning(): void {
  console.info();
  renderWarnLine(70);
  renderWarnLine(3, chalk.bold(`Make sure you are using the latest code!`), 27);
  renderWarnLine(70);
  renderWarnLine(3, 'If any of your packages require to be compiled, please make sure', 3);
  renderWarnLine(
    3,
    `that you start any ${chalk.bold('yarn watch, yarn build, etc.')} command.`,
    11
  );
  renderWarnLine(70);
  renderWarnLine(3, `Otherwise, you can end up with the outdated linked code.`, 11);
  renderWarnLine(70);
  console.info();
}

function renderWarnLine(length: number): void;
function renderWarnLine(leftPadding: number, text: string, rightPadding: number): void;
function renderWarnLine(leftPadding: number, text?: string, rightPadding?: number): void {
  const p = length => new Array(length).fill(' ').join('');

  if (text == null && rightPadding == null) {
    console.info(chalk.yellow.inverse(p(leftPadding)));
  } else {
    console.info(chalk.yellow.inverse(p(leftPadding) + text + p(rightPadding)));
  }
}
