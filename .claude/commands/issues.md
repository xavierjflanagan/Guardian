Create a well-structured GitHub issue for the following feature description and automatically create it in the repository:

$ARGUMENTS

Research the repository structure and create a comprehensive GitHub issue that follows best practices, then automatically create it in GitHub. Include:

<feature_description>
$ARGUMENTS
</feature_description>

Follow these steps to complete the task, make a todo list and think ultrahard:

1. Research the repository:
   - Examine the repository's structure, existing issues, and documentation
   - Look for any CONTRIBUTING.md, ISSUE_TEMPLATE.md, or similar files that might contain guidelines for creating issues
   - Note the project's coding style, naming conventions, and any specific requirements for submitting issues

2. Research best practices:
   - Search for current best practices in writing GitHub issues, focusing on clarity, completeness, and actionability
   - Look for examples of well-written issues in popular open-source projects for inspiration

3. Use clear, concise language throughout the issue. Avoid jargon unless it's necessary for technical accuracy.

4. If the feature description lacks certain details, make reasonable assumptions based on common software development practices. Clearly indicate any assumptions you make.

5. Format the issue using GitHub-flavored Markdown. Use appropriate headings, lists, and code blocks where necessary.

6. **Ensure Self-Contained Development Ready Issues**: The issue must be self-contained and provide comprehensive information for a developer to start working on the feature without needing additional context. Include:
   - Clear acceptance criteria with actionable checkboxes
   - Technical implementation details and file structure suggestions
   - Database schema or API specifications if applicable
   - Integration points with existing codebase
   - Security considerations and best practices
   - Testing requirements and success metrics
   - **Healthcare Platform Context**: For Guardian healthcare platform issues, include:
     - Patient data protection and privacy considerations
     - Healthcare compliance impact (Australian Privacy Act, HIPAA)
     - Medical workflow integration requirements
     - Security and audit trail implications

7. **AUTOMATICALLY CREATE THE ISSUE**: 
   - Use the `gh issue create` command to create the issue in GitHub
   - Add appropriate labels (use available labels like "enhancement", "bug", "documentation", etc.)
   - Add the issue to the project if one exists (check with `gh project list`)
   - Include the Claude Code signature: "🤖 Generated with [Claude Code](https://claude.ai/code)"

8. **UPDATE CENTRAL ISSUE MANAGEMENT FILE**:
   - **REQUIRED**: After creating the GitHub issue, automatically add it to `shared/docs/management/github-issues-todo.md`
   - Categorize the issue by priority level (CRITICAL/HIGH/MEDIUM/LOW)
   - Assess healthcare impact (CRITICAL/HIGH/MEDIUM/LOW) based on patient data and compliance risk
   - Provide realistic time estimates and identify dependencies
   - Link to relevant documentation files in the context
   - Update the total issue count in the file header
   - Update the summary dashboard statistics to reflect the new issue

9. **Provide the GitHub issue URL**: After creating the issue and updating the management file, provide the URL so the user can access it directly.

Your workflow should be:
1. Research and plan the issue content
2. Create the issue using `gh issue create` with proper formatting
3. Add it to the project board if available
4. **IMMEDIATELY update `shared/docs/management/github-issues-todo.md` with the new issue**
5. Provide the final GitHub issue URL to the user

Do NOT output the formatted issue text - instead, create it directly in GitHub and provide the URL.