#!/bin/bash

TARGET="$HOME/.agent/skills"
SOURCE="$(cd "$(dirname "$0")/.." && pwd)/master-pack"

mkdir -p "$TARGET"
cp -R "$SOURCE" "$TARGET"

echo "Antigravity Web Design Skills installed."