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
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { ExtensionContextSymbol } from '/@/inject/symbol';
import {
  type ProviderConnectionStatus,
  type ExtensionContext,
  provider,
  ContainerProviderConnection,
} from '@podman-desktop/api';

/**
 * Manager for the authentication provider.
 * This class is responsible for creating and managing authentication sessions.
 */
@injectable()
export class ContainerProviderManager {
  public static readonly PROVIDER_ID = 'apple-container';

  @inject(ExtensionContextSymbol)
  private readonly extensionContext: ExtensionContext;

  private providerState: ProviderConnectionStatus = 'stopped';


  async registerContainerProvider(): Promise<void> {


    const podmanDesktopProvider = provider.createProvider({
    name: 'Apple',
    id: ContainerProviderManager.PROVIDER_ID,
    status: 'ready',
    images: {
      icon: './icon.png',
      logo: './logo.png',
    },
  });
    this.extensionContext.subscriptions.push(podmanDesktopProvider);

    const homeDir = homedir();
   const socketPath = resolve(homeDir, '.socktainer', 'container.sock');
   

   this.providerState = 'started';

  const containerProviderConnection: ContainerProviderConnection = {
    name: 'Apple',
    type: 'docker',
    status: (): ProviderConnectionStatus => this.providerState,
    endpoint: {
      socketPath,
    },
  };

  const connectionDisposable = podmanDesktopProvider.registerContainerProviderConnection(containerProviderConnection);

  this.extensionContext.subscriptions.push(connectionDisposable);


  }

}
