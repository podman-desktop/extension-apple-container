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
import { ExtensionContextSymbol, TelemetryLoggerSymbol } from '/@/inject/symbol';
import {
  type ProviderConnectionStatus,
  type ExtensionContext,
  provider,
  process,
  ContainerProviderConnection,
  Provider,
  Disposable,
  TelemetryLogger,
  TelemetryTrustedValue,
} from '@podman-desktop/api';
import { ChildProcess, spawn } from 'node:child_process';

/**
 * Manager for the authentication provider.
 * This class is responsible for creating and managing authentication sessions.
 */
@injectable()
export class ContainerProviderManager {
  public static readonly PROVIDER_ID = 'apple-container';

  @inject(ExtensionContextSymbol)
  private readonly extensionContext: ExtensionContext;

  @inject(TelemetryLoggerSymbol)
  private readonly telemetryLogger: TelemetryLogger;

  #socktainerProcess: ChildProcess | undefined;

  #connectionDisposable: Disposable | undefined;

  #containerProviderConnection: ContainerProviderConnection | undefined;

  #stopMonitoringStatus = false;

  async registerContainerProvider(): Promise<void> {
    this.#stopMonitoringStatus = false;
    const appleProvider = provider.createProvider({
      name: 'Apple',
      id: ContainerProviderManager.PROVIDER_ID,
      status: 'unknown',
      images: {
        icon: './icon.png',
        logo: './logo.png',
      },
    });
    this.extensionContext.subscriptions.push(appleProvider);

    this.monitorContainerSystemStatus(appleProvider).catch((error: unknown) => {
      console.error('Error monitoring podman machines', error);
    });
  }

  async deactivate(): Promise<void> {
    this.#stopMonitoringStatus = true;
    if (this.#socktainerProcess) {
      await this.cleanupConnection();
    }
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

    // Kill process if any
    this.#containerProviderConnection = undefined;
    this.#socktainerProcess?.kill();
    this.#socktainerProcess = undefined;
  }

  async updateContainerSystemStatus(appleProvider: Provider): Promise<void> {
    // Check if apple container runtime is installed and running
    // Launch container system --version

    let systemInstalled = false;
    const telemetryProperties: Record<string, string | TelemetryTrustedValue> = {};
    try {
      const {stdout} =await process.exec('/usr/local/bin/container', ['system', '--version']);
      telemetryProperties.version = stdout.trim();
      systemInstalled = true;
    } catch (error: unknown) {
      console.error('Error checking container system version', error);
    }

    if (systemInstalled) {
      appleProvider.updateStatus('installed');
    } else {
      appleProvider.updateStatus('unknown');
      // Unregister any existing connection if any
      await this.cleanupConnection();
      return;
    }

    // Launch the command 'container runtime status' and check if there is an error
    let systemRunning = false;
    try {
      await process.exec('/usr/local/bin/container', ['system', 'status']);
      systemRunning = true;
    } catch (error: unknown) {
      console.error('Error checking container runtime status', error);
    }
    if (systemRunning) {
      // Is it already started?
      if (this.#containerProviderConnection) {
        console.log('container provider connection already started');
        return;
      }

      appleProvider.updateStatus('ready');
      // Register also the socktainer
      // Start the socktainer process
      // Use folder from dist folder
      let socktainerBinPath: string;
      if (import.meta.env.DEV) {
        socktainerBinPath = resolve(__dirname, '..', 'dist', 'bin', 'socktainer');
      } else {
        socktainerBinPath = resolve(__dirname, 'bin', 'socktainer');
      }
      console.log('Starting socktainer from path', socktainerBinPath);

      this.#socktainerProcess = spawn(socktainerBinPath);
      this.#socktainerProcess.stdout?.on('data', data => {
        console.log(`socktainer: ${data}`);
      });
      this.#socktainerProcess.stderr?.on('data', data => {
        console.error(`socktainer error: ${data}`);
      });
      this.#socktainerProcess.on('close', code => {
        console.log(`socktainer process exited with code ${code}`);
      });

      const homeDir = homedir();
      const socketPath = resolve(homeDir, '.socktainer', 'container.sock');

      let providerState: ProviderConnectionStatus = 'starting';

      this.#containerProviderConnection = {
        name: 'Apple',
        type: 'docker',
        status: (): ProviderConnectionStatus => providerState,
        endpoint: {
          socketPath,
        },
      };

      // Wait a couple of seconds to let the socktainer start
      await this.timeout(2000);
      providerState = 'started';
      this.#connectionDisposable = appleProvider.registerContainerProviderConnection(this.#containerProviderConnection);
      this.telemetryLogger.logUsage('registeredConnection', telemetryProperties);
      this.extensionContext.subscriptions.push(this.#connectionDisposable);
    } else {
      // Cleanup any existing connection
      await this.cleanupConnection();
      // Not running
      appleProvider.updateStatus('stopped');
    }
  }

  async monitorContainerSystemStatus(provider: Provider): Promise<void> {
    // Call us again
    if (!this.#stopMonitoringStatus) {
      try {
        await this.updateContainerSystemStatus(provider);
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
