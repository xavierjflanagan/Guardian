Execute the sign-in protocol to start a new work session with proper documentation and context gathering.

$ARGUMENTS

Follow these steps to complete the sign-in protocol, create a todo list and execute systematically:

## 🎯 **Protocol Steps**

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

### Step 1: Check Previous Session
- Review the last entry in `docs/PROGRESS_LOG.md` to ensure the previous session was properly signed off.
- If the last session is missing completion details:
  - Ask: *"I notice your last session wasn't properly signed off. Do you remember what you accomplished and how long you worked? I can help you complete that sign-off first."*
  - If the user provides information:
    - Execute the sign-off protocol retrospectively using the provided details, then proceed with sign-in.
  - If the user doesn't remember or doesn't respond:
    - Add a default entry to the progress log:
      ```markdown
      ## [ESTIMATED_DATE] Previous Session (Incomplete Sign-off)
      - **Duration:** Unknown
      - **Accomplishments:** Session occurred but details not recorded
      - **Status:** Incomplete documentation - sign-off missed
      - **R&D Hours:** 0 (cannot verify for compliance)
      ---
      ```
    - Then proceed with current sign-in.

### Step 2: Gather User Goals & Raw Log
Ask the user these questions in a single message:
- What are your main goals for this session? (2-3 key objectives)
- How long do you plan to work?
- Is there a specific area of focus? (e.g., frontend, docs)

**Capture the user's response to "main goals" VERBATIM for the log.**

### Step 3: Generate Session Plan & Update Progress Log

This is a two-part step. First, you will create a lightweight session plan. Second, you will log both the plan and the user's raw goals.

#### Step 3a: Generate Claude's Session Plan
Based on the user's stated goals and a review of the `AI_context.md` and `TASKS.md` files, generate a concise, actionable plan for the session. This is not a deep analysis, but a quick alignment check.

Your plan **must** include:
- **Top Priorities**: A bulleted list of the 2-3 key tasks for the day, framed to align with project goals.
- **Contextual Reminder**: A brief sentence reminding the user of the last session's outcome to ensure continuity (e.g., "Yesterday, we finished the auth logic; today is about the UI.").
- **Focus Points**: A suggestion for where to start or a key question to consider.

#### Step 3b: Update Progress Log
- **Get current date and time**: Use the `date` command.
- **Append** a new entry to the top of `docs/PROGRESS_LOG.md`.

  ```markdown
  ## [YYYY-MM-DD] Work Session Started
  - **Start Time:** [HH:MM TIMEZONE]
  - **Planned Duration:** [User-provided duration]
  - **Claude's Session Plan:**
    - **Top Priorities:**
      - [Generated bullet point 1]
      - [Generated bullet point 2]
    - **Context:** [Generated reminder of previous work]
  - **User's Verbatim Goals:**
    > [Paste the user's full, unedited response about their goals here]
  ---
  ```
- **Important:** All logs must be append-only.

### Step 4: Provide Contextual Briefing

Now, deliver the **`Claude's Session Plan`** you just created as the primary output to the user. Frame it as a collaborative starting point.

**Briefing should include:**
- A clear presentation of the **Top Priorities**.
- The **Contextual Reminder** to orient the user.
- The **Focus Points** to provide a clear starting action.
- A final, encouraging sentence to kick off the session.

## 🛡️ **Error Handling**

If previous session wasn't signed off:
1. **Offer to complete it** before starting new session
2. **Allow user to skip** if they prefer
3. **Note the gap** in documentation

If files are missing:
1. **Create them** with appropriate templates
2. **Note file creation** in response
3. **Continue with protocol**

## 🎯 **Success Criteria**

Protocol is successful when:
- [x] Previous session status checked
- [x] User goals and plans captured
- [x] Session start documented
- [x] User receives helpful briefing

The goal is to **quickly orient** the user and **set up the session** for productivity.

## 📁 **Files That May Need Updates**

### Primary Files (Always Update)
- `docs/PROGRESS_LOG.md` - Session start logging

### Review Files (For Context)
- `docs/context/AI_context.md` - Canonical project context and recent decisions
- `docs/management/TASKS.md` - Current task priorities and status
- Recent entries in progress log for session continuity

**Execute this protocol systematically and provide a comprehensive session briefing to get the user oriented and productive quickly.**