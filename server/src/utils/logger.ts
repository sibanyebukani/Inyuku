export function logger(name: string) {
  return {
    info: (msg: string, meta?: Record<string, unknown>) =>
      console.log(JSON.stringify({ level: 'info', logger: name, message: msg, ...meta })),
    error: (msg: string, meta?: Record<string, unknown>) =>
      console.error(JSON.stringify({ level: 'error', logger: name, message: msg, ...meta })),
    warn: (msg: string, meta?: Record<string, unknown>) =>
      console.warn(JSON.stringify({ level: 'warn', logger: name, message: msg, ...meta })),
  };
}
