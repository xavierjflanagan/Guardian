Execute the sign-off protocol to end a work session with proper documentation and R&D compliance tracking.

$ARGUMENTS

Follow these steps to complete the sign-off protocol, create a todo list and execute systematically:

## 📋 **Protocol Steps**

### Step 0: Git Hygiene Check
- Run `git status` and `git fetch origin` before any other protocol actions.
- Summarize:
  - Any uncommitted changes? (Prompt to commit/stash)
  - Is `main` behind `origin/main`? (Prompt to pull/review)
  - Any new remote changes? (Prompt to review PRs or pull)
- If all clear, confirm you're ready to proceed.
- *Why?* This keeps your repo safe, up to date, and prevents conflicts—professional daily Git workflow.

### Step 0.5: Review Protocol Documentation
- Read `docs/protocols/README.md` to understand the full context and intended outcomes of the protocol system
- This ensures proper execution and validates that all promised benefits are delivered

### Step 1: Gather Session Information
Ask the user these questions in a single message (dot points, one after the other):

in this session;
- what work did you do?
- how many hours? (as decimal, e.g. 4.5)
- what are your priorities next session?
- any blockers or issues?

**When the user provides their session summary, copy and paste their full written response verbatim (including diary-style notes) into the 'Accomplishments' field of the progress log entry.**

### Step 2: Update Progress Log
- **Get current date and time**: Use `date` command to get current date and time for accurate logging
- **Append** a new entry at the top of `docs/PROGRESS_LOG.md` in this format:
  ```markdown
  ## [YYYY-MM-DD] Work Session Summary
  - **Start Time:** [From the Work Session Started block]
  - **Accomplishments:** [User's summary]
  - **Blockers:** [Any issues noted]
  - **Next Session Focus:** [User's next priorities]
  - **R&D Hours:** [X.X hours]
  ---
  ```
- **Important:** Never edit or overwrite any session logs (including 'Work Session Started' blocks). Every session event must be append-only for audit and compliance.

### Step 2.5: Update AI Context Log

**Comprehensive AI Context Review & Update** in `docs/context/AI_context.md`:

**First, Review Entire File:**
- Read through all existing sections to understand current project state
- Identify outdated information, completed tasks, or changed priorities
- Note gaps between documented context and actual progress

**Then, Update Contextually:**
- **Project Goal**: Update if scope, priorities, or objectives evolved during session
- **Tech Stack & Architecture**: Modify if new technologies added, removed, or architectural decisions changed
- **Session Updates**: 
  - Update existing session summaries if they contain outdated "Next Steps" or "Blockers"
  - Add new session update that builds on previous context rather than repeating information
  - Reference and connect to previous sessions' outcomes
- **Cross-Reference**: Ensure consistency with related documentation files that were modified

**Session Update Content:**
- **Progress**: What was accomplished, referencing previous session goals
- **Decisions**: Key architectural, technical, or process decisions made
- **Context Evolution**: How the project understanding or direction changed
- **Next Steps**: Updated priorities based on current state
- **Blockers**: Current obstacles, noting which previous blockers were resolved

**Error Handling**: If unable to update, note the failure and suggest manual update.

### Step 2.75: Sync Technical Tasks
- Read the current `docs/management/TASKS.md` file.
- Check for any updates or changes since last session.
- Sync all technical tasks with the Notion Technical Task Board (https://www.notion.so/22887f8cee9e816b98cbc8a99950d452).
- Ensure both TASKS.md and Notion board are up to date (push/pull as needed).

### Step 3: Confirm Completion
- Respond to the user with a completion message that includes:
  - **Files Modified**: List all files that were actually updated during the sign-off process
  - **Session Summary**: Brief recap of what was logged
  - **Sign-off Quote**: A random inspirational quote
  
Example format:
```
Session sign-off complete! 

**Files Updated:**
- docs/PROGRESS_LOG.md
- docs/context/AI_context.md
- docs/management/TASKS.md

**Session Summary:**
- R&D Hours: [X.X hours]
- Focus: [Brief summary of work]
- Next session: [Key priorities]

Great work this session!
[Insert a random sign-off quote here, e.g., "Rest is not idleness, and to lie sometimes on the grass under trees on a summer's day... is by no means a waste of time." – John Lubbock]
```

## 🛡️ **Error Handling**
- If any step fails, continue with other steps and note the failure in your response. Suggest manual action if needed.
- If user provides incomplete information, ask for clarification or use reasonable defaults (e.g., "General development work"). Proceed with available information rather than blocking.

## 🎯 **Success Criteria**
- User questions answered and recorded
- Progress log updated with session details
- Task management reflects current status
- User receives confirmation message
- All session logs are append-only; no edits or overwrites to any previous blocks

The goal is to make this seamless and quick—the entire interaction should take 2-3 minutes maximum.

## 📁 **Files That May Need Updates**
- `docs/PROGRESS_LOG.md` (always updated)
- `docs/context/AI_context.md` (always updated)
- `docs/management/TASKS.md` (for task status sync)
- Other documentation files as needed (conditional based on session work)

**Execute this protocol systematically to ensure proper R&D compliance, project tracking, and seamless session management.**