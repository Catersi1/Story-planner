#!/usr/bin/env bash
# One-shot script: push this folder to https://github.com/Catersi1/Story-planner
# Run from Terminal:
#   cd "$HOME/Library/Mobile Documents/com~apple~CloudDocs/My apps backup/AI story builder"
#   bash push-to-github.sh

set -e

REMOTE_URL="https://github.com/Catersi1/Story-planner.git"
BRANCH="main"

cd "$(dirname "$0")"
echo "Working in: $(pwd)"

# 1. Clear any stale git lock files left over from earlier attempts
echo "Clearing stale git locks (if any)..."
find .git -name "*.lock" -type f -print -delete 2>/dev/null || true

# 2. Make sure git is initialized (it already is, but be safe)
if [ ! -d .git ]; then
  git init -b "$BRANCH"
fi

# 3. Set git identity if not already set
if [ -z "$(git config user.email)" ]; then
  git config user.email "mizaelpena@hardysprouts.com"
fi
if [ -z "$(git config user.name)" ]; then
  git config user.name "Mizael"
fi

# 4. Stage everything and commit if there are changes / no commits yet
git add -A
if ! git rev-parse --verify HEAD >/dev/null 2>&1; then
  git commit -m "Initial commit"
elif ! git diff --cached --quiet; then
  git commit -m "Update"
else
  echo "Nothing new to commit."
fi

# 5. Make sure we're on main
git branch -M "$BRANCH"

# 6. Set / update the remote
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$REMOTE_URL"
else
  git remote add origin "$REMOTE_URL"
fi

# 7. Push. macOS will use Keychain / gh auth / osxkeychain helper for credentials.
echo "Pushing to $REMOTE_URL ..."
git push -u origin "$BRANCH"

echo
echo "Done. View your repo: $REMOTE_URL"
