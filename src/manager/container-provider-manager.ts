/**********************************************************************
 * Copyright (C) 2025 Red Hat, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 ***********************************************************************/

import { inject, injectable } from 'inversify';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { env } from 'node:process';
import { ExtensionContextSymbol, TelemetryLoggerSymbol } from '/@/inject/symbol';
import {
  type ProviderConnectionStatus,
  type ProviderStatus,
  type ExtensionContext,
  type Logger,
  provider,
  process,
  ContainerProviderConnection,
  Provider,
  Disposable,
  TelemetryLogger,
  TelemetryTrustedValue,
  window,
} from '@podman-desktop/api';
import { ChildProcess, spawn } from 'node:child_process';
import socktainerVersions from '../../socktainer-versions.json';

/**
 * Manager for the authentication provider.
 * This class is responsible for creating and managing authentication sessions.
 */
@injectable()
export class ContainerProviderManager {
  public static readonly PROVIDER_ID = 'apple-container';

  // Apps launched from the macOS Finder/Dock don't inherit the shell PATH: add the usual install folders
  // (official installer: /usr/local/bin, Homebrew: /opt/homebrew/bin, MacPorts: /opt/local/bin)
  static readonly MACOS_EXTRA_PATH = '/usr/local/bin:/opt/homebrew/bin:/opt/local/bin';

  // Displayed on the Resources page while no connection is registered
  static readonly EMPTY_CONNECTION_DESCRIPTION = [
    'Run and manage [Apple containers](https://github.com/apple/container) on macOS with Apple silicon.',
    `Install the Apple container CLI (supported versions: ${Object.keys(socktainerVersions).join(', ')}): the Apple connection then appears here automatically, and its system service can be started from here or with \`container system start\`.`,
    'More information: [extension README](https://github.com/podman-desktop/extension-apple-container#readme)',
  ].join('\n\n');

  @inject(ExtensionContextSymbol)
  private readonly extensionContext: ExtensionContext;

  @inject(TelemetryLoggerSymbol)
  private readonly telemetryLogger: TelemetryLogger;

  #socktainerProcess: ChildProcess | undefined;

  #connectionDisposable: Disposable | undefined;

  // Follows the Apple container system service: 'stopped' when it is not running, 'started' once socktainer serves it
  #connectionStatus: ProviderConnectionStatus = 'stopped';

  // Status checks and Start/Stop actions are chained so that they never run concurrently
  #pendingStatusTask: Promise<void> = Promise.resolve();

  #stopMonitoringStatus = false;

  #unsupportedVersionReported = false;

  // Apple container minor version the running socktainer was picked for
  #socktainerContainerVersion: string | undefined;

  async registerContainerProvider(): Promise<void> {
    this.#stopMonitoringStatus = false;
    const appleProvider = provider.createProvider({
      name: 'Apple',
      id: ContainerProviderManager.PROVIDER_ID,
      status: 'unknown',
      images: {
        icon: './icon.png',
        logo: './icon.png',
      },
      emptyConnectionMarkdownDescription: ContainerProviderManager.EMPTY_CONNECTION_DESCRIPTION,
    });
    this.extensionContext.subscriptions.push(appleProvider);

    this.monitorContainerSystemStatus(appleProvider).catch((error: unknown) => {
      console.error('Error monitoring podman machines', error);
    });
  }

  async deactivate(): Promise<void> {
    this.#stopMonitoringStatus = true;
    await this.cleanupConnection();
  }

  async timeout(time: number): Promise<void> {
    return new Promise<void>(resolve => {
      setTimeout(resolve, time);
    });
  }

  async cleanupConnection(): Promise<void> {
    // Stop connection
    this.#connectionDisposable?.dispose();
    if (this.#connectionDisposable) {
      this.extensionContext.subscriptions.splice(
        this.extensionContext.subscriptions.indexOf(this.#connectionDisposable!),
        1,
      );
    }
    this.#connectionDisposable = undefined;

    this.stopSocktainer();
    this.#connectionStatus = 'stopped';
  }

  protected stopSocktainer(): void {
    // Forget the process first so that its 'close' listener ignores this expected exit
    const socktainerProcess = this.#socktainerProcess;
    this.#socktainerProcess = undefined;
    this.#socktainerContainerVersion = undefined;
    socktainerProcess?.kill();
  }

  // Run the task once the previous status check or Start/Stop action is done
  protected queueStatusTask(task: () => Promise<void>): Promise<void> {
    const result = this.#pendingStatusTask.then(task);
    this.#pendingStatusTask = result.catch(() => {});
    return result;
  }

  // Register the Apple connection once the container CLI is detected.
  // It stays registered while the system service is stopped so that it can be started from the Resources page
  protected registerConnection(appleProvider: Provider): void {
    if (this.#connectionDisposable) {
      return;
    }
    const connection: ContainerProviderConnection = {
      name: 'Apple',
      type: 'docker',
      status: (): ProviderConnectionStatus => this.#connectionStatus,
      endpoint: {
        socketPath: resolve(homedir(), '.socktainer', 'container.sock'),
      },
      lifecycle: {
        start: (_context, logger): Promise<void> => this.startContainerSystem(appleProvider, logger),
        stop: (_context, logger): Promise<void> => this.stopContainerSystem(appleProvider, logger),
      },
    };
    this.#connectionDisposable = appleProvider.registerContainerProviderConnection(connection);
    this.extensionContext.subscriptions.push(this.#connectionDisposable);
  }

  async startContainerSystem(appleProvider: Provider, logger?: Logger): Promise<void> {
    return this.queueStatusTask(async () => {
      // The extension was deactivated while this action was queued: don't start the system behind its back
      if (this.#stopMonitoringStatus) {
        return;
      }
      appleProvider.updateStatus('starting');
      this.#connectionStatus = 'starting';
      try {
        // Install the default kernel on the first start instead of waiting for an answer to the interactive prompt
        await process.exec('container', ['system', 'start', '--enable-kernel-install'], {
          env: { PATH: this.getInstallationPath() },
          logger,
        });
      } finally {
        // Start socktainer if the system is now running, or go back to 'stopped' if it failed to start
        await this.updateContainerSystemStatus(appleProvider);
      }
    });
  }

  async stopContainerSystem(appleProvider: Provider, logger?: Logger): Promise<void> {
    return this.queueStatusTask(async () => {
      appleProvider.updateStatus('stopping');
      this.#connectionStatus = 'stopping';
      this.stopSocktainer();
      try {
        await process.exec('container', ['system', 'stop'], { env: { PATH: this.getInstallationPath() }, logger });
      } finally {
        // Report 'stopped', or start socktainer again if the system is still running
        await this.updateContainerSystemStatus(appleProvider);
      }
    });
  }

  // Use folder from dist folder
  protected getSocktainerBinPath(containerMinorVersion: string): string {
    if (import.meta.env.DEV) {
      return resolve(__dirname, '..', 'dist', 'bin', containerMinorVersion, 'socktainer');
    }
    return resolve(__dirname, 'bin', containerMinorVersion, 'socktainer');
  }

  // Avoid logging the same error on every poll: only log when the status is about to change
  protected logOnStatusChange(previous: ProviderStatus, next: ProviderStatus, message: string, error: unknown): void {
    if (previous !== next) {
      console.error(message, error);
    }
  }

  protected getInstallationPath(): string {
    const extraPath = ContainerProviderManager.MACOS_EXTRA_PATH;
    return env.PATH ? `${env.PATH}:${extraPath}` : extraPath;
  }

  protected async startSocktainer(
    containerMinorVersion: string,
    telemetryProperties: Record<string, string | TelemetryTrustedValue>,
  ): Promise<void> {
    // Start the socktainer process
    const socktainerBinPath = this.getSocktainerBinPath(containerMinorVersion);
    console.log('Starting socktainer from path', socktainerBinPath);

    const socktainerProcess = spawn(socktainerBinPath);
    this.#socktainerProcess = socktainerProcess;
    this.#socktainerContainerVersion = containerMinorVersion;
    socktainerProcess.stdout?.on('data', data => {
      console.log(`socktainer: ${data}`);
    });
    socktainerProcess.stderr?.on('data', data => {
      console.error(`socktainer error: ${data}`);
    });
    // Without a listener, a spawn failure (e.g. missing or non executable binary) is thrown as an uncaught exception
    socktainerProcess.on('error', error => {
      console.error('Error running socktainer', error);
    });
    socktainerProcess.on('close', code => {
      console.log(`socktainer process exited with code ${code}`);
      // The socktainer stopped on its own: report the connection as stopped so that the next status check starts it again
      if (this.#socktainerProcess === socktainerProcess) {
        this.#socktainerProcess = undefined;
        this.#socktainerContainerVersion = undefined;
        this.#connectionStatus = 'stopped';
      }
    });

    this.#connectionStatus = 'starting';

    // Wait a couple of seconds to let the socktainer start
    await this.timeout(2000);
    // The socktainer exited or was stopped while waiting: don't report a dead connection as started
    if (this.#socktainerProcess !== socktainerProcess) {
      return;
    }
    this.#connectionStatus = 'started';
    this.telemetryLogger.logUsage('registeredConnection', telemetryProperties);
  }

  async updateContainerSystemStatus(appleProvider: Provider): Promise<void> {
    // Check if apple container runtime is installed and running
    // Launch container system --version
    // Only log errors on status transitions, not on every poll
    const previousStatus = appleProvider.status;

    let systemInstalled = false;
    let containerMinorVersion: string | undefined;
    const telemetryProperties: Record<string, string | TelemetryTrustedValue> = {};
    try {
      const { stdout } = await process.exec('container', ['system', '--version'], {
        env: { PATH: this.getInstallationPath() },
      });
      telemetryProperties.version = stdout.trim();
      // E.g. 'container CLI version 1.5.0 (build: release, commit: d265d66)' -> '1.5'
      containerMinorVersion = /version (\d+\.\d+)\./.exec(stdout)?.[1];
      systemInstalled = true;
    } catch (error: unknown) {
      this.logOnStatusChange(previousStatus, 'not-installed', 'Error checking container system version', error);
    }

    if (systemInstalled) {
      appleProvider.updateStatus('installed');
    } else {
      appleProvider.updateStatus('not-installed');
      // Unregister any existing connection if any
      await this.cleanupConnection();
      return;
    }

    if (!containerMinorVersion || !Object.hasOwn(socktainerVersions, containerMinorVersion)) {
      const message = `Apple container version '${telemetryProperties.version}' is not supported. Supported versions: ${Object.keys(socktainerVersions).join(', ')}.`;
      console.error(message);
      appleProvider.updateStatus('error');
      await this.cleanupConnection();
      if (!this.#unsupportedVersionReported) {
        this.#unsupportedVersionReported = true;
        window.showErrorMessage(message).catch(console.error);
      }
      return;
    }
    this.#unsupportedVersionReported = false;
    telemetryProperties.socktainerVersion =
      socktainerVersions[containerMinorVersion as keyof typeof socktainerVersions];

    // Launch the command 'container runtime status' and check if there is an error
    let systemRunning = false;
    try {
      await process.exec('container', ['system', 'status'], { env: { PATH: this.getInstallationPath() } });
      systemRunning = true;
    } catch (error: unknown) {
      this.logOnStatusChange(previousStatus, 'stopped', 'Error checking container runtime status', error);
    }
    // The extension was deactivated during the checks: don't register anything
    if (this.#stopMonitoringStatus) {
      return;
    }
    this.registerConnection(appleProvider);
    if (systemRunning) {
      appleProvider.updateStatus('ready');

      // Apple container version changed since socktainer was started: restart the matching one
      if (this.#socktainerProcess && this.#socktainerContainerVersion !== containerMinorVersion) {
        console.log(`Apple container version changed to ${containerMinorVersion}, restarting socktainer`);
        this.stopSocktainer();
      }

      // Is it already started?
      if (this.#socktainerProcess) {
        console.log('container provider connection already started');
        return;
      }

      await this.startSocktainer(containerMinorVersion, telemetryProperties);
    } else {
      // Not running: socktainer has nothing to serve
      this.stopSocktainer();
      this.#connectionStatus = 'stopped';
      appleProvider.updateStatus('stopped');
    }
  }

  async monitorContainerSystemStatus(provider: Provider): Promise<void> {
    // Call us again
    if (!this.#stopMonitoringStatus) {
      try {
        await this.queueStatusTask(() => this.updateContainerSystemStatus(provider));
      } catch (error: unknown) {
        // Ignore the update of status
        console.trace('Error updating container system status', error);
      }

      await this.timeout(30000);
      this.monitorContainerSystemStatus(provider).catch((error: unknown) => {
        console.error('Error monitoring podman machines', error);
      });
    }
  }
}
