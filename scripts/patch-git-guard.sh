#!/bin/bash
# git-guard の電話番号検出に法令ID除外ロジックを追加するパッチ
#
# 対象: ~/.agents/skills/git-guard/hooks/pre-commit, pre-push
# 変更内容: scan_email_and_phone() 内の電話番号検出で、
#           e-Gov法令IDパターン ([0-9]{3}[A-Z]{1,2}[0-9]{7,13}) を含む行をスキップ

set -e

# Resolve hook directory from git config or HOME
HOOK_DIR=""
GIT_HOOKS_PATH=$(git config --global core.hookspath 2>/dev/null || true)
if [ -n "$GIT_HOOKS_PATH" ] && [ -d "$GIT_HOOKS_PATH" ]; then
    # core.hooksPath is set — use the same base directory
    HOOK_DIR="$GIT_HOOKS_PATH"
elif [ -d "$HOME/.agents/skills/git-guard/hooks" ]; then
    HOOK_DIR="$HOME/.agents/skills/git-guard/hooks"
else
    echo "ERROR: git-guard hooks directory not found"
    echo "  Set core.hooksPath or place hooks in ~/.agents/skills/git-guard/hooks/"
    exit 1
fi

patch_file() {
    local file="$1"
    local basename
    basename=$(basename "$file")

    if [ ! -f "$file" ]; then
        echo "ERROR: $file not found"
        return 1
    fi

    # Check if already patched
    if grep -q 'e-Gov law IDs' "$file" 2>/dev/null; then
        echo "SKIP: $basename is already patched"
        return 0
    fi

    # Create backup
    cp "$file" "${file}.bak"
    echo "BACKUP: ${basename}.bak created"

    # Apply patch: add law ID exclusion before add_issue in phone detection
    sed -i '/add_issue "\$file:\$line_num - Phone number detected: \$phone"/i\
                # Skip e-Gov law IDs (e.g., 325AC0000000201) — not phone numbers\
                local source_line\
                source_line=$(echo "$content" | sed -n "${line_num}p")\
                if echo "$source_line" | grep -qE '"'"'[0-9]{3}[A-Z]{1,2}[0-9]{7,13}'"'"'; then\
                    continue\
                fi' "$file"

    echo "PATCHED: $basename"
}

echo "=== git-guard 法令ID除外パッチ ==="
echo ""

patch_file "$HOOK_DIR/pre-commit"
patch_file "$HOOK_DIR/pre-push"

echo ""
echo "=== 完了 ==="
echo "バックアップ: pre-commit.bak, pre-push.bak"
