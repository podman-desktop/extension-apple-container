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
- [Installation](#installation)
- [Feedback](#feedback)

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

## 💬 Feedback

We ❤️ feedback! Please [open an issue](https://github.com/podman-desktop/extension-apple-container/issues) if you encounter bugs or have suggestions.
