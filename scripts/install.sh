#!/usr/bin/env bash
# allfilesZ — quick installer for Linux/macOS.
# Downloads the latest release for your OS/arch, or builds from source.
#   curl -fsSL https://raw.githubusercontent.com/dinaxy148822822-create/allfilesZ/main/scripts/install.sh | bash
set -euo pipefail

REPO="dinaxy148822822-create/allfilesZ"
OS="$(uname -s)"
ARCH="$(uname -m)"

say() { printf '\033[1;36m▸\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m✘\033[0m %s\n' "$*" >&2; exit 1; }

latest() {
  curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
    | grep -oP '"tag_name":\s*"\K[^"]+' | head -1
}

case "${OS}:${ARCH}" in
  Linux:x86_64)  PLATFORM="linux";  ABI="x64" ;;
  Linux:aarch64) PLATFORM="linux";  ABI="arm64" ;;
  Darwin:arm64)  PLATFORM="mac";    ABI="arm64" ;;
  Darwin:x86_64) PLATFORM="mac";    ABI="x64" ;;
  *) die "Unsupported platform: ${OS} ${ARCH}. Build from source: npm ci && npm run dist" ;;
esac

# Prefer a native package manager when clearly available
if [ "${PLATFORM}" = "linux" ]; then
  if command -v pacman >/dev/null 2>&1 && [ "${1:-}" != "--no-pacman" ]; then
    say "Arch-based system detected — try the AUR package: allfilesz-bin"
    say "(falling back to AppImage download in 5s — Ctrl+C to stop)"
    sleep 5
  elif command -v apt >/dev/null 2>&1 && [ "${1:-}" != "--no-apt" ]; then
    say "Debian-based system detected — a .deb is attached to every release too."
  fi
fi

say "Fetching latest release…"
TAG="$(latest || true)"
[ -n "${TAG}" ] || die "Could not resolve the latest release. Check https://github.com/${REPO}/releases"
VER="${TAG#v}"
say "Latest version: ${VER}"

if [ "${PLATFORM}" = "mac" ]; then
  ASSET="allfilesZ-${VER}-mac-${ABI}.dmg"
else
  ASSET="allfilesZ-${VER}-${ABI}.AppImage"
fi
URL="https://github.com/${REPO}/releases/download/${TAG}/${ASSET}"

say "Downloading ${ASSET}…"
curl -fL --progress-bar -o "/tmp/${ASSET}" "${URL}"

if [ "${PLATFORM}" = "mac" ]; then
  say "Opening ${ASSET} — drag allfilesZ to Applications."
  open "/tmp/${ASSET}" 2>/dev/null || die "Download finished: /tmp/${ASSET}"
else
  DEST="$HOME/Applications"
  mkdir -p "${DEST}"
  install -m 755 "/tmp/${ASSET}" "${DEST}/allfilesZ.AppImage"
  say "Installed to ${DEST}/allfilesZ.AppImage"
  say "Note: PDF compression benefits from Ghostscript; docs→PDF needs LibreOffice (both optional)."
fi

say "Done."
