# Sign-In Protocol Policy

**Purpose:** This document defines the sign-in protocol for starting a new work session when the user requests "execute sign in protocol" or 
wants to start a work session. It now uses only `docs/PROGRESS_LOG.md` as the single source of truth for session tracking.

---

## 🎯 **When to Execute This Protocol**

Execute this protocol when the user says any of:
- "Execute sign in protocol"
- "Start work session"
- "Begin session"
- "Sign in for work"
- Similar requests to start a work session

---

## 📋 **Protocol Steps**

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

### Step 2: Gather Session Information
Ask the user these questions in a single message (dot points, one after the other):

For this session;
- What are your main goals? (2-3 key objectives or tasks)
- How long do you plan to work?
- Any specific areas you want to focus on? (Optional: e.g., frontend, backend, documentation, architecture)

### Step 3: Update Progress Log
- Add a new entry at the top of `docs/PROGRESS_LOG.md` in this format:
  ```markdown
  ## [YYYY-MM-DD] Work Session Started
  - **Start Time:** [Current time]
  - **Session Goals:** [User's main objectives]
  ---
  ```

### Step 4: Provide Briefing
- Generate a session briefing by reading the new entry and the previous entry (the summary from the last session) in `docs/PROGRESS_LOG.md`.

---

## 📁 **Files That May Need Updates**

### Primary Files (Always Update)
- `docs/PROGRESS_LOG.md` - Session start logging

### Review Files (For Context)
- `docs/management/TASKS.md` - Current task priorities
- Recent entries in progress log for context

---

## 🛡️ **Error Handling**

If previous session wasn't signed off:
1. **Offer to complete it** before starting new session
2. **Allow user to skip** if they prefer
3. **Note the gap** in documentation

If files are missing:
1. **Create them** with appropriate templates
2. **Note file creation** in response
3. **Continue with protocol**

---

## 🎯 **Success Criteria**

Protocol is successful when:
- [x] Previous session status checked
- [x] User goals and plans captured
- [x] Session start documented
- [x] User receives helpful briefing

The goal is to **quickly orient** the user and **set up the session** for productivity.

---

## 📝 **Example Interaction**

**User:** "Execute sign in protocol"

**AI:** "I'll start your work session! Let me ask a couple quick questions:

For this session;
- What are your main goals?
- How long do you plan to work?
- Any specific areas you want to focus on?

**User:** [Provides answers]

**AI:** "Perfect! Let me check your current status and get you set up...

🚀 Work session started successfully!

📋 Session Overview:
- Goals: Complete API documentation, start deployment guide
- Current priorities: Document processor endpoint, API docs, troubleshooting guide  
- Recent progress: Major documentation overhaul completed yesterday
- Estimated duration: 4 hours

📍 Current Project Status:
You're in Phase 1 of MVP development. Authentication and file upload are complete, now focusing on documentation and AI pipeline development.

You're all set! [Insert a random inspirational quote here, e.g., "The future depends on what you do today." – Mahatma Gandhi]