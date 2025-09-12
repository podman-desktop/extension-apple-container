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

// version of socktainer to download
const SOCKTAINER_VERSION = 'v0.1.0';

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import AdmZip from 'adm-zip';

// Fix __dirname and __filename in ES module scope
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const downloadUrl = `https://github.com/benoitf/socktainer/releases/download/${SOCKTAINER_VERSION}/socktainer.zip`;

const outputDir = path.resolve(__dirname, '..', 'dist', 'bin');
const downloadedZipFile = path.join(outputDir, 'socktainer.zip');

class Downloader {
  private async downloadFile(url: string, dest: string): Promise<void> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to download ${url} (${res.status})`);
    }

    const fileStream = fs.createWriteStream(dest);
    const reader = res.body?.getReader();
    if (!reader) throw new Error('No response body');

    return new Promise((resolve, reject) => {
      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            fileStream.write(value);
          }
          fileStream.end();
          fileStream.on('finish', resolve);
        } catch (err) {
          reject(err);
        }
      };
      pump();
    });
  }

  private async extractZip(filePath: string, targetDir: string): Promise<void> {
    const zip = new AdmZip(filePath);
    zip.extractAllTo(targetDir, true);
  }

  public async downloadAndExtract(): Promise<void> {
    if (!fs.existsSync(outputDir)) {
      await fs.promises.mkdir(outputDir, { recursive: true });
    }

    console.log(`Downloading socktainer from ${downloadUrl}...`);
    await this.downloadFile(downloadUrl, downloadedZipFile);

    console.log(`Extracting ${downloadedZipFile} to ${outputDir}...`);
    await this.extractZip(downloadedZipFile, outputDir);

    // Cleanup zip file
    await fs.promises.unlink(downloadedZipFile);

    // add execution permission to the binary
    const binaryPath = path.join(outputDir, 'socktainer');
    await fs.promises.chmod(binaryPath, 0o755);

    console.log('✅ Download and extraction complete');
  }
}

(async () => {
  const downloader = new Downloader();
  await downloader.downloadAndExtract();
})();
