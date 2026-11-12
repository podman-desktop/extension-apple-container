# 🦭🍏 Podman Desktop Apple Container Extension

![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue)

A **Podman Desktop extension** to manage **Apple containers** on **macOS** (ARM64 only).

![Apple container screenshot](https://github.com/user-attachments/assets/1895e15c-7518-4af7-9a3e-6542a29f027d)

![Apple container screenshot2](https://github.com/user-attachments/assets/83a8bbb7-626c-4af1-bd4e-c23d3042eb1a)

---

## 🚀 Features

- View and manage Apple containers directly in Podman Desktop
- Designed specifically for macOS on ARM64
- Easy installation and updates via Podman Desktop
- Uses **[Socktainer](https://github.com/socktainer/socktainer)** under the hood to provide a Docker REST API on top of Apple containers

---

## 🔍 How It Works

This extension relies on **[Socktainer](https://github.com/socktainer/socktainer)**, a lightweight CLI/daemon that exposes a **REST API** to manage Apple containers. The API is designed to be **compatible with the Docker REST API**, enabling tools and extensions that expect Docker behavior to work with Apple containers without modification. Podman Desktop interacts with this API to provide a full-featured, user-friendly interface for container management on macOS ARM64.

---

## 📚 Topics

- [Installation](#-installation)
- [Supported versions](#-supported-versions)
- [Using the Docker CLI](#-using-the-docker-cli)
- [Troubleshooting](#-troubleshooting)
- [Development](#-development)
- [Feedback](#-feedback)

---

## 🛠 Installation

Install the Apple container extension directly from **Podman Desktop**:

1. Open **Podman Desktop** → `Extensions` → `Install custom...`
2. Enter the extension image:

```
ghcr.io/podman-desktop/extension-apple-container:next
```

3. Click **Install** ✅

> To install a specific release, check available versions and replace `:next` with `:<version>`

4. Make sure the Apple container system is installed and running:

```
container system start
container system status
```

---

## 📦 Supported versions

The extension embeds one [socktainer](https://github.com/socktainer/socktainer) binary for each supported Apple container minor version, and starts the one that matches the installed `container` CLI.

[`socktainer-versions.json`](socktainer-versions.json) lists the supported versions: it maps each Apple container minor version to its socktainer release. A nightly workflow opens a pull request to update it when new releases come out, so that it covers the last 3 Apple container minor versions.

To check which version is installed:

```
container system --version
```

---

## 🐳 Using the Docker CLI

While the **Apple** connection is running, socktainer serves a Docker-compatible API on `~/.socktainer/container.sock` and registers a `socktainer` Docker context. You can use it with the `docker` CLI and other Docker clients:

```
docker context use socktainer
docker ps
```

Or without changing the current context:

```
DOCKER_HOST=unix://$HOME/.socktainer/container.sock docker ps
```

Socktainer doesn't implement the whole Docker API: see the [socktainer README](https://github.com/socktainer/socktainer#readme) for what is supported.

---

## 🩺 Troubleshooting

The extension checks the Apple container system every 30 seconds, so a change (installing the CLI, starting the system service, ...) can take up to 30 seconds to show up in Podman Desktop.

### The Apple container CLI is not detected

The extension runs `container system --version`. It looks for `container` in the `PATH` of Podman Desktop and in the usual install folders: `/usr/local/bin` (official installer), `/opt/homebrew/bin` (Homebrew) and `/opt/local/bin` (MacPorts). Podman Desktop doesn't get your shell `PATH` when you open it from the Finder or the Dock. If the CLI is installed somewhere else, add a symbolic link to it in one of these folders.

### "Apple container version '...' is not supported"

The installed Apple container CLI isn't one of the [supported versions](#-supported-versions), and the Apple provider is in error. Install a supported version: the error goes away on the next check.

### The Apple container system service is not running

The extension starts socktainer only while `container system status` reports that the system service is running. Start it and check its status:

```
container system start
container system status
```

### The connection is running but containers and images don't load

Check that socktainer answers on its socket:

```
curl --unix-socket ~/.socktainer/container.sock http://localhost/_ping
```

It prints `OK` when socktainer and the Apple container system work. If socktainer stopped, the extension starts it again on the next check.

### Logs

The output of the extension and of socktainer is in the Podman Desktop logs: open the **Troubleshooting** page and select **Logs**. Extension lines are tagged with `[apple-container]`, and socktainer output is prefixed with `socktainer:` or `socktainer error:`. Please include these lines when you [open an issue](https://github.com/podman-desktop/extension-apple-container/issues).

---

## 🔧 Development

Requirements:

- [Node.js](https://nodejs.org/), with the version from [`.nvmrc`](.nvmrc)
- [pnpm](https://pnpm.io/), with the version from the `packageManager` field of [`package.json`](package.json) (`corepack enable` installs it)
- macOS on Apple silicon with a [supported Apple container version](#-supported-versions), to run the extension. You can build and test it on any OS.

Build the extension and load it in Podman Desktop running from source (`pnpm watch` rebuilds the extension when its sources change):

```sh
git clone https://github.com/podman-desktop/podman-desktop
git clone https://github.com/podman-desktop/extension-apple-container
cd extension-apple-container
pnpm install
pnpm download-dependencies
pnpm watch
# in another terminal
cd podman-desktop
pnpm install
pnpm watch --extension-folder ../extension-apple-container
```

`pnpm download-dependencies` downloads the socktainer binaries of all supported versions to `dist/bin/<version>/socktainer`. Run it again when `socktainer-versions.json` changes. Without these binaries, the extension can't start socktainer, and the logs show `spawn .../socktainer ENOENT` errors.

Before opening a pull request, run the same checks as the CI:

```sh
pnpm test           # unit tests with coverage
pnpm lint:check     # ESLint and Biome lint (pnpm lint:fix to fix)
pnpm format:check   # Biome formatting (pnpm format:fix to fix)
pnpm typecheck
pnpm build
```

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) and are signed off (`git commit -s`).

---

## 💬 Feedback

We ❤️ feedback! Please [open an issue](https://github.com/podman-desktop/extension-apple-container/issues) if you encounter bugs or have suggestions.
