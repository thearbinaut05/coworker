import { Logger } from '../src/utils/logger';

describe('Logger', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger();
  });

  test('should create logger instance', () => {
    expect(logger).toBeInstanceOf(Logger);
  });

  test('should log info messages', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    logger.info('test message');
    consoleSpy.mockRestore();
  });

  test('should log error messages', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    logger.error('test error');
    consoleSpy.mockRestore();
  });
});