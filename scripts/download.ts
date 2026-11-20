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

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import AdmZip from 'adm-zip';
// Apple container minor version -> socktainer version and SHA-256 of its socktainer.zip release asset
import socktainerVersions from '../socktainer-versions.json';

// Fix __dirname and __filename in ES module scope
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const binDir = path.resolve(__dirname, '..', 'dist', 'bin');

export class Downloader {
  // The file is only written once its SHA-256 matches the expected one
  private async downloadFile(url: string, dest: string, expectedSha256: string): Promise<void> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to download ${url} (${res.status})`);
    }

    const content = Buffer.from(await res.arrayBuffer());
    const sha256 = createHash('sha256').update(content).digest('hex');
    if (sha256 !== expectedSha256) {
      throw new Error(`Checksum mismatch for ${url}: expected SHA-256 ${expectedSha256}, got ${sha256}`);
    }
    await fs.promises.writeFile(dest, content);
  }

  private async extractZip(filePath: string, targetDir: string): Promise<void> {
    const zip = new AdmZip(filePath);
    zip.extractAllTo(targetDir, true);
  }

  public async downloadAndExtract(version: string, expectedSha256: string, outputDir: string): Promise<void> {
    const downloadUrl = `https://github.com/socktainer/socktainer/releases/download/${version}/socktainer.zip`;
    const downloadedZipFile = path.join(outputDir, 'socktainer.zip');

    if (!fs.existsSync(outputDir)) {
      await fs.promises.mkdir(outputDir, { recursive: true });
    }

    console.log(`Downloading socktainer from ${downloadUrl}...`);
    await this.downloadFile(downloadUrl, downloadedZipFile, expectedSha256);

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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const downloader = new Downloader();
  for (const [containerVersion, { version, sha256 }] of Object.entries(socktainerVersions)) {
    await downloader.downloadAndExtract(version, sha256, path.join(binDir, containerVersion));
  }
}
