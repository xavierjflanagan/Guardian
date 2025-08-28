# Healthcare Permission Model Analysis

**Created:** August 28, 2025  
**Purpose:** Document comprehensive healthcare permission hierarchy and emergency access design  
**Status:** Analysis of current V3 database permission model

---

## User's Original Permission Requirements (Verbatim)

> mmm i think any registered healthcare doctor provider should have the ability to grant themselves emergency permissions in the event of a medical emergency so that they can read the file, but this woudl send off lots of allerts abd 'break the glass' etc. aka they can look them up if they have their detials and click confirm to being liable if its not an emergency.... Also i think a user can grant civilians emergency status (emergency contact type thing), where they can also break the glass if its an emergency. Then there is the read-only permissions which may be given to spouses or adult children to keep an eye on parents etc. they can always view the profile without the profile owner getting notified (but it would be in the logs). The user may also grant read access to all healthcare providers if they wish, or to specific providers, or they may grant read-write to all providers or to specific providers. They may also grant read-write persmissiont o their spouse so that their spouse can upload files to their profiel ont heir behalf (effectively this turns their account into a 'mirror type' 'sub profile' on their spouses account, which can be revoked by the rightful owner at any time (i actually love this concept and it will probably be used a lot, such as a elderly parent giving up control of their health to their adult child who is on top of their health and supporting them to all their appointments etc).

---

## Comprehensive Permission Model Architecture

### **1. Emergency Access ("Break the Glass")**

#### **Healthcare Provider Emergency Access**
- **Who**: Any registered healthcare provider in the system
- **Mechanism**: Self-granted emergency access to any patient profile
- **Triggers**: 
  - Massive system alerts
  - Complete audit trail
  - Liability confirmation dialog required
- **Use Case**: ER doctor needs immediate access to unconscious patient's medical history
- **Access Level**: Read-only with full medical data visibility

#### **Civilian Emergency Contact Access**
- **Who**: Pre-designated emergency contacts (family members, friends)
- **Mechanism**: User grants emergency contact status in advance
- **Triggers**:
  - Break-glass confirmation required
  - Emergency situation validation
  - Alert notifications sent
- **Use Case**: Spouse needs access when patient is unconscious/incapacitated
- **Access Level**: Read-only emergency access

### **2. Regular User-Granted Permissions**

#### **Read-Only Family/Caregiver Access**
- **Who**: Spouses, adult children, designated caregivers
- **Purpose**: Silent health monitoring and oversight
- **Key Feature**: **No notifications sent to profile owner** (stealth monitoring)
- **Audit**: All access logged but profile owner not alerted
- **Use Cases**:
  - Adult children monitoring elderly parents' health
  - Spouses keeping track of each other's medical appointments
  - Caregivers staying informed without being intrusive

#### **Healthcare Provider Read Access**
- **Who**: Specific providers OR all healthcare providers (user's choice)
- **Purpose**: Standard healthcare relationship permissions
- **User Control**: Patient decides which providers can access their data
- **Scope**: Normal medical record viewing for treatment purposes

#### **Healthcare Provider Read-Write Access**
- **Who**: Specific providers OR all healthcare providers (user's choice)
- **Purpose**: Providers can contribute to patient's medical record
- **Capabilities**: Upload test results, clinical notes, prescriptions, treatment plans
- **User Control**: Patient grants based on trust and healthcare relationship

#### **Full Mirror Access (Family Read-Write)**
- **Innovation**: "Caregiver Takeover" model
- **Who**: Trusted family members (typically adult children, spouses)
- **Capabilities**: 
  - Upload files on behalf of profile owner
  - Manage medical appointments
  - Essentially "become" the patient in the system for healthcare management
- **Key Features**:
  - **Revocable**: Original owner can revoke at any time
  - **Complete delegation**: Full healthcare management authority
  - **Primary Use Case**: Elderly parent delegates health management to adult child
- **Business Value**: Addresses aging population healthcare management needs

---

## Current V3 Database Implementation Analysis

### **ENUM Permission Hierarchy**
```sql
CREATE TYPE access_level_type AS ENUM (
    'none', 'emergency', 'read_only', 'read_write', 'full_access', 'owner'
);
```

### **Hierarchy Logic Assessment**
**Current ENUM order is PERFECTLY DESIGNED for this model:**

1. **`none`**: No access
2. **`emergency`**: Can read but triggers alerts/audit (lowest privilege level)
3. **`read_only`**: Can read silently without alerts (higher privilege - stealth access)
4. **`read_write`**: Can modify/add data (higher privilege)
5. **`full_access`**: Complete healthcare management delegation
6. **`owner`**: Original profile owner with ultimate control

### **Permission Comparison Logic**
The `>=` comparison in `has_profile_access_level()` function works correctly:
- Higher permission levels include all capabilities of lower levels
- Emergency access (level 1) can do emergency operations
- Read-only (level 2) can do emergency + silent monitoring
- Read-write (level 3) can do all of the above + data modification

---

## Implementation Recommendations

### **Enhanced Audit Fields**
Consider adding to `profile_access_permissions` table:
```sql
ALTER TABLE profile_access_permissions ADD COLUMN triggers_alerts BOOLEAN DEFAULT TRUE;
ALTER TABLE profile_access_permissions ADD COLUMN requires_break_glass BOOLEAN DEFAULT FALSE;
ALTER TABLE profile_access_permissions ADD COLUMN emergency_contact BOOLEAN DEFAULT FALSE;
ALTER TABLE profile_access_permissions ADD COLUMN liability_acknowledged BOOLEAN DEFAULT FALSE;
```

### **Permission-Specific Behaviors**
- **Emergency access**: `triggers_alerts = TRUE, requires_break_glass = TRUE`
- **Read-only family**: `triggers_alerts = FALSE` (stealth monitoring)
- **Provider access**: Standard alerting based on user preferences
- **Mirror access**: Full delegation with revocation capability

---

## Gemini Review Finding Assessment

**Finding 2 from Gemini's review was INCORRECT:**
- Gemini suggested the ENUM ordering was "brittle" and could cause permission issues
- **Analysis shows**: The ENUM hierarchy perfectly matches the intended permission model
- **Conclusion**: No changes needed - current implementation is optimal for the healthcare use cases

---

## Business Innovation Highlights

### **"Mirror Access" Concept**
The full read-write family access creating a "mirror profile" is genuinely innovative:
- **Market Need**: Aging population requiring healthcare management support
- **Technical Solution**: Seamless delegation without losing original ownership
- **User Experience**: Adult child can manage parent's healthcare as if it were their own account
- **Legal Safety**: Revocable at any time by original owner

### **Stealth Monitoring**
Read-only family access without notifications addresses real-world family dynamics:
- **Practical Need**: Family members wanting to stay informed without being intrusive
- **Technical Implementation**: Access logged but owner not notified
- **Use Cases**: Adult children monitoring elderly parents, spouses staying informed

---

**Document Status**: Complete analysis of permission model  
**Next Steps**: Review and validate implementation meets all described use cases  
**Created by**: Claude Code Analysis based on user requirements