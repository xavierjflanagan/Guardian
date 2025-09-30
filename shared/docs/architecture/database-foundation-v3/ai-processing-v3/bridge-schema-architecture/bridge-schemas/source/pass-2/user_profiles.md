# user_profiles Bridge Schema (Source) - PENDING RECREATION

**Status:** 🚧 Requires systematic recreation against database source of truth
**Database Source:** /current_schema/02_profiles.sql (user_profiles table)
**Last Updated:** 30 September 2025
**Priority:** CRITICAL - Core profile management and identity data

## Potential Issues:
- Profile identity and demographic data structure
- Missing required fields (owner_user_id, source_shell_file_id)
- Profile relationship and ownership tracking
- Data type mismatches for identity fields
- Missing database-specific fields for profile management
- Privacy and security considerations for personal information

TODO: Recreate this schema by reading the actual database table structure from 02_profiles.sql