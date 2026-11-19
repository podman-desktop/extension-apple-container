/**********************************************************************
 * Copyright (C) 2026 Red Hat, Inc.
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

import AdmZip from 'adm-zip';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import socktainerVersions from '../socktainer-versions.json';
import { Downloader } from './socktainer-downloader';

const zip = new AdmZip();
zip.addFile('socktainer', Buffer.from('socktainer binary'));
const zipContent = zip.toBuffer();
const zipSha256 = createHash('sha256').update(zipContent).digest('hex');

let outputDir: string;

beforeEach(async () => {
  outputDir = path.join(await fs.promises.mkdtemp(path.join(tmpdir(), 'socktainer-downloader-')), 'bin');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(new Uint8Array(zipContent))),
  );
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await fs.promises.rm(path.dirname(outputDir), { recursive: true, force: true });
});

describe('downloadAndExtract', () => {
  it('should extract socktainer when the archive matches its checksum', async () => {
    expect.assertions(3);

    await new Downloader().downloadAndExtract('v1.6.1', zipSha256, outputDir);

    expect(fetch).toHaveBeenCalledWith(
      'https://github.com/socktainer/socktainer/releases/download/v1.6.1/socktainer.zip',
    );
    expect(await fs.promises.readdir(outputDir)).toStrictEqual(['socktainer']);
    expect(await fs.promises.readFile(path.join(outputDir, 'socktainer'), 'utf8')).toBe('socktainer binary');
  });

  it('should reject an archive not matching its checksum without extracting it', async () => {
    expect.assertions(2);

    const expectedSha256 = 'a'.repeat(64);

    await expect(new Downloader().downloadAndExtract('v1.6.1', expectedSha256, outputDir)).rejects.toThrow(
      `Checksum mismatch for https://github.com/socktainer/socktainer/releases/download/v1.6.1/socktainer.zip: expected SHA-256 ${expectedSha256}, got ${zipSha256}`,
    );
    expect(await fs.promises.readdir(outputDir)).toStrictEqual([]);
  });

  it('should report a failed download', async () => {
    expect.assertions(1);

    vi.mocked(fetch).mockResolvedValue(new Response('Not Found', { status: 404 }));

    await expect(new Downloader().downloadAndExtract('v1.6.1', zipSha256, outputDir)).rejects.toThrow(
      'Failed to download https://github.com/socktainer/socktainer/releases/download/v1.6.1/socktainer.zip (404)',
    );
  });
});

describe('socktainer-versions.json', () => {
  it('should have a SHA-256 checksum for each socktainer version', () => {
    expect.assertions(1);

    expect(Object.values(socktainerVersions).every(({ sha256 }) => /^[\da-f]{64}$/.test(sha256))).toBe(true);
  });
});
