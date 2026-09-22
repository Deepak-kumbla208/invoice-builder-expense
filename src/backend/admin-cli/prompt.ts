import { createInterface } from 'readline';
import { Writable } from 'stream';

export type Prompter = {
  ask: (question: string) => Promise<string>;
  askHidden: (question: string) => Promise<string>;
  close: () => void;
};

export const createPrompter = (
  input: NodeJS.ReadableStream & { isTTY?: boolean } = process.stdin,
  output: NodeJS.WritableStream = process.stdout
): Prompter => {
  let muted = false;
  const sink = new Writable({
    write(chunk, _encoding, callback) {
      if (!muted) output.write(chunk);
      callback();
    }
  });
  const terminal = Boolean(input.isTTY);
  const rl = createInterface({ input, output: sink, terminal });
  rl.on('SIGINT', () => {
    output.write('\n');
    process.exit(130);
  });
  const lines = rl[Symbol.asyncIterator]();

  const read = async (question: string, hidden: boolean) => {
    rl.setPrompt(question);
    rl.prompt();
    muted = hidden && terminal;
    try {
      const { value, done } = await lines.next();
      if (done) throw new Error('Input ended before every question was answered.');
      return value as string;
    } finally {
      if (muted) {
        muted = false;
        output.write('\n');
      }
    }
  };

  return {
    ask: async question => (await read(question, false)).trim(),
    askHidden: question => read(question, true),
    close: () => rl.close()
  };
};
