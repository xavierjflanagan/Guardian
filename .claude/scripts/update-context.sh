#!/bin/bash

# Guardian Claude Code Context Update Script
# Updates agent context when files are modified

FILE_PATH="$1"
TOOL_NAME="$2"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "Updating agent context for file: $FILE_PATH"

# Determine which agent should be notified based on file path
if [[ "$FILE_PATH" =~ ^supabase/ ]] || [[ "$FILE_PATH" =~ ^lib/supabase ]] || [[ "$FILE_PATH" =~ middleware\.ts ]]; then
    echo "[$TIMESTAMP] Infrastructure file modified: $FILE_PATH" >> .claude/memory/sergei/context-updates.md
    echo "Notified Sergei (Infrastructure) about file change"
    
elif [[ "$FILE_PATH" =~ document-processor ]] || [[ "$FILE_PATH" =~ validateAI ]] || [[ "$FILE_PATH" =~ testNormalization ]]; then
    echo "[$TIMESTAMP] AI processing file modified: $FILE_PATH" >> .claude/memory/tessa/context-updates.md
    echo "Notified Tessa (AI Processing) about file change"
    
elif [[ "$FILE_PATH" =~ ^app/ ]] || [[ "$FILE_PATH" =~ ^components/ ]] || [[ "$FILE_PATH" =~ \.tsx$ ]] || [[ "$FILE_PATH" =~ globals\.css ]]; then
    echo "[$TIMESTAMP] Frontend file modified: $FILE_PATH" >> .claude/memory/prue/context-updates.md
    echo "Notified Prue (Frontend) about file change"
    
elif [[ "$FILE_PATH" =~ quality ]] || [[ "$FILE_PATH" =~ test ]] || [[ "$FILE_PATH" =~ validate ]]; then
    echo "[$TIMESTAMP] Quality/testing file modified: $FILE_PATH" >> .claude/memory/quinn/context-updates.md
    echo "Notified Quinn (Quality) about file change"
    
elif [[ "$FILE_PATH" =~ healthcare ]] || [[ "$FILE_PATH" =~ fhir ]] || [[ "$FILE_PATH" =~ clinical ]]; then
    echo "[$TIMESTAMP] Healthcare data file modified: $FILE_PATH" >> .claude/memory/cleo/context-updates.md
    echo "Notified Cleo (Healthcare Data) about file change"
fi

# Always log to shared context for cross-agent awareness
echo "[$TIMESTAMP] File modified: $FILE_PATH (Tool: $TOOL_NAME)" >> .claude/memory/shared/recent-changes.md

echo "Context update completed"