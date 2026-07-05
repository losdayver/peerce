export const enum AnsiColor {
  BLACK = 30,
  RED = 31,
  GREEN = 32,
  YELLOW = 33,
  BLUE = 34,
  MAGENTA = 35,
  CYAN = 36,
  WHITE = 37,
  GRAY = 90,
  BRIGHTRED = 91,
  BRIGHTGREEN = 92,
  BRIGHTYELLOW = 93,
  BRIGHTBLUE = 94,
  BRIGHTMAGENTA = 95,
  BRIGHTCYAN = 96,
  BRIGHTWHITE = 97,
}

const ansi = (text: string, code: number) => `\x1b[${code}m${text}\x1b[0m`;

export function colorLog(
  message?: unknown,
  color: AnsiColor = AnsiColor.WHITE
): void {
  const time = new Date().toLocaleTimeString();
  const colored = ansi(`${time}>`, color);
  console.log(`${colored} ${message}`);
}

export const logInfo = (message: unknown) =>
  colorLog(message, AnsiColor.BRIGHTMAGENTA);
export const logWarning = (message: unknown) =>
  colorLog(message, AnsiColor.YELLOW);
export const logError = (message: unknown) => colorLog(message, AnsiColor.RED);
