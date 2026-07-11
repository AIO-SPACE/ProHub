const write = (level, message, context = {}) => {
  const entry = {
    time: new Date().toISOString(),
    level,
    message,
    ...context,
  };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else console.log(line);
};

export const logger = {
  info: (message, context) => write('info', message, context),
  warn: (message, context) => write('warn', message, context),
  error: (message, context) => write('error', message, context),
};
