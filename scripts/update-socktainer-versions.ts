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

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// number of Apple container minor versions to support
const SUPPORTED_MINOR_VERSIONS = 3;

// socktainer release asset embedded in the extension
const SOCKTAINER_ASSET = 'socktainer.zip';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const versionsFile = path.join(rootDir, 'socktainer-versions.json');

export interface Release {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  // digest is e.g. 'sha256:<hex>', computed by GitHub when the asset is uploaded
  assets: { name: string; digest?: string }[];
}

export class SocktainerVersionsUpdater {
  // tag -> [minor, patch] e.g. 'v1.5.1' -> ['1.5', 1]
  private parse(tag: string): [string, number] | undefined {
    const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag);
    return match ? [`${match[1]}.${match[2]}`, Number(match[3])] : undefined;
  }

  // keep the tag of the latest patch of each minor version
  private latestPatches(tags: string[]): Map<string, { tag: string; patch: number }> {
    const latest = new Map<string, { tag: string; patch: number }>();
    for (const tag of tags) {
      const parsed = this.parse(tag);
      if (!parsed) continue;
      const [minor, patch] = parsed;
      if (patch >= (latest.get(minor)?.patch ?? -1)) {
        latest.set(minor, { tag, patch });
      }
    }
    return latest;
  }

  // Apple container minor version -> socktainer version, for the last minors having a socktainer counterpart
  public computeVersions(containerTags: string[], socktainerTags: string[]): Record<string, string> {
    const socktainer = this.latestPatches(socktainerTags);
    const entries = [...this.latestPatches(containerTags).keys()]
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
      .flatMap(minor => {
        const tag = socktainer.get(minor)?.tag;
        return tag ? [[minor, tag]] : [];
      })
      .slice(0, SUPPORTED_MINOR_VERSIONS);
    return Object.fromEntries(entries);
  }

  // socktainer version -> SHA-256 of its socktainer.zip release asset, for each socktainer version in use
  public computeChecksums(versions: Record<string, string>, socktainerReleases: Release[]): Record<string, string> {
    const entries = Object.values(versions).map(tag => {
      const asset = socktainerReleases
        .find(release => release.tag_name === tag)
        ?.assets.find(releaseAsset => releaseAsset.name === SOCKTAINER_ASSET);
      const sha256 = /^sha256:([\da-f]{64})$/.exec(asset?.digest ?? '')?.[1];
      if (!sha256) {
        throw new Error(`No SHA-256 digest found for the ${SOCKTAINER_ASSET} asset of socktainer ${tag}`);
      }
      return [tag, sha256];
    });
    return Object.fromEntries(entries);
  }

  private async fetchReleases(repository: string): Promise<Release[]> {
    const response = await fetch(`https://api.github.com/repos/${repository}/releases?per_page=100`, {
      headers: process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {},
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch releases of ${repository}: ${response.status} ${response.statusText}`);
    }
    const releases = (await response.json()) as Release[];
    return releases.filter(release => !release.draft && !release.prerelease);
  }

  public async update(): Promise<void> {
    const containerReleases = await this.fetchReleases('apple/container');
    const socktainerReleases = await this.fetchReleases('socktainer/socktainer');
    const versions = this.computeVersions(
      containerReleases.map(release => release.tag_name),
      socktainerReleases.map(release => release.tag_name),
    );
    if (Object.keys(versions).length === 0) {
      throw new Error('No Apple container version with a socktainer counterpart found');
    }
    const checksums = this.computeChecksums(versions, socktainerReleases);
    const entries = Object.fromEntries(
      Object.entries(versions).map(([minor, version]) => [minor, { version, sha256: checksums[version] }]),
    );
    await fs.promises.writeFile(versionsFile, `${JSON.stringify(entries, undefined, 2)}\n`);
    console.log('Updated', versionsFile, entries);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await new SocktainerVersionsUpdater().update();
}
