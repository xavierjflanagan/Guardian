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

### Step 1: Gather Session Information & Raw Log
Ask the user these questions in a single message:
- What work did you accomplish this session?
- How many hours did you work? (e.g., 4.5)
- What are your priorities for the next session?
- Are there any blockers or issues?

**Crucially, capture the user's response to "what work did you accomplish" VERBATIM. This is for historical context and compliance.**

### Step 2: Generate Structured Analysis & Update Progress Log

This is a two-part step. First, you will analyze the user's raw input and the project context. Second, you will use that analysis to create a structured log entry.

#### Step 2a: Generate Claude's Structured Analysis
Based on the user's raw log, the AI context (`docs/context/AI_context.md`), and the tasks (`docs/management/TASKS.md`), generate a concise, structured analysis. This analysis is the "so what" of the session's work.

Your analysis **must** include:
- **Key Accomplishments**: A bulleted list of the 2-4 most significant achievements from the session. Translate the user's narrative into concrete outcomes.
- **Alignment with Goals**: Briefly state how these accomplishments map to the session goals declared at sign-in.
- **Impact & Decisions**: Note any key decisions made (e.g., "Decided to use library X for Y") or the overall impact on the project (e.g., "This completes the backend for feature Z").
- **Emerging Issues/Questions**: Identify any new risks, blockers, or open questions that arose during the session.

#### Step 2b: Update Progress Log
- **Get current date and time**: Use the `date` command for accurate logging.
- **Append** a new entry to the top of `docs/PROGRESS_LOG.md`. Use the analysis from the previous step to fill out the structured fields.

  ```markdown
  ## [YYYY-MM-DD] Work Session Summary
  - **Start Time:** [From the corresponding 'Work Session Started' block]
  - **R&D Hours:** [X.X hours]
  - **Claude's Structured Summary:**
    - **Key Accomplishments:**
      - [Generated bullet point 1]
      - [Generated bullet point 2]
    - **Impact & Decisions:** [Generated summary of impact]
  - **Blockers:** [User-reported issues + any identified in analysis]
  - **Next Session Focus:** [User's stated priorities]
  - **User's Verbatim Log:**
    > [Paste the user's full, unedited response about their work here]
  ---
  ```
- **Important:** The `User's Verbatim Log` must be an exact copy of their input. The other fields are your structured analysis. All logs must be append-only.

### Step 2.5: Update AI Context Log

Now, use the **`Claude's Structured Summary`** you just created to update the main AI context file.

**Action:**
- Read `docs/context/AI_context.md`.
- Synthesize the key points from your **`Structured Summary`** (accomplishments, decisions, impact) into the `Session Updates` section of the AI context file.
- Do NOT simply copy-paste. Integrate the new information smoothly with the existing context. The goal is to evolve the context file, not just add a new block of text.
- Ensure the `Next Steps` and `Blockers` in the AI context file reflect the latest information from the session sign-off.

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