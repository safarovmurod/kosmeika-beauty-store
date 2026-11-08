import { emitKeypressEvents, type Key } from 'node:readline';
import { stdin, stdout } from 'node:process';

export function readPassword(prompt: string): Promise<string> {
  if (!stdin.isTTY || !stdout.isTTY) throw new Error('Откройте create-admin.cmd двойным щелчком в папке проекта.');
  emitKeypressEvents(stdin);
  stdout.write(prompt);
  const wasRaw = stdin.isRaw;
  stdin.setRawMode(true);
  stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    function finish() {
      stdin.off('keypress', onKey);
      stdin.setRawMode(wasRaw);
      stdin.pause();
      stdout.write('\n');
    }
    function onKey(text: string | undefined, key: Key) {
      if (key.ctrl && key.name === 'c') {
        finish(); reject(new Error('Создание отменено.')); return;
      }
      if (key.name === 'return' || key.name === 'enter') {
        finish(); resolve(value); return;
      }
      if (key.name === 'backspace') {
        if (value.length) { value = Array.from(value).slice(0, -1).join(''); stdout.write('\b \b'); }
        return;
      }
      // Ignore arrow keys and terminal control sequences.
      if (!text || key.ctrl || key.meta || Array.from(text).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return;
      if (value.length + text.length > 1024) return;
      value += text;
      stdout.write('*'.repeat(Array.from(text).length));
    }
    stdin.on('keypress', onKey);
  });
}
