import type { ExtensionContext } from '@podman-desktop/api';
import { beforeEach, expect, test, vi } from 'vitest';
import { activate, deactivate } from './main';
import { AppleContainerExtension } from './apple-container-extension';

let extensionContextMock: ExtensionContext;

vi.mock(import('./apple-container-extension'));

beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();

  // Create a mock for the ExtensionContext
  extensionContextMock = {} as ExtensionContext;
});

test('should initialize and activate the AppleContainerExtension when activate is called', async () => {
  expect.assertions(1);

  // Call activate
  await activate(extensionContextMock);

  // Ensure that the AppleContainerExtension is instantiated and its activate method is called
  expect(AppleContainerExtension.prototype.activate).toHaveBeenCalledWith();
});

test('should call deactivate when deactivate is called', async () => {
  expect.assertions(1);

  // Call activate first to initialize AppleContainerExtension
  await activate(extensionContextMock);

  // Call deactivate
  await deactivate();

  // Ensure that the deactivate method was called
  expect(AppleContainerExtension.prototype.deactivate).toHaveBeenCalledWith();
});

test('should set appleContainerExtension to undefined after deactivate is called', async () => {
  expect.assertions(2);

  // Call activate to initialize the extension
  await activate(extensionContextMock);

  // Call deactivate
  await deactivate();

  expect(global).toHaveProperty('appleContainerExtension');
  expect((global as Record<string, unknown>).appleContainerExtension).toBeUndefined();
});
