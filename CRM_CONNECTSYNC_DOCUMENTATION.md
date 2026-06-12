# CRM ConnectSync Feature Documentation

## Overview

CRM ConnectSync is a complete end-to-end feature that automatically syncs HubCredo leads and outreach activities to Attio CRM. When users approve a lead, it's instantly created as a contact in their Attio workspace, and subsequent outreach activities (email opens, replies, LinkedIn connections) are logged as contact activities.

## Architecture

### Backend Components

#### 1. **Attio OAuth Service** (`lib/attio.ts`)
- Handles OAuth authorization flow with Attio
- Manages access token and refresh token
- Provides API methods to interact with Attio CRM:
  - `createContact()` - Create new contact in Attio
  - `updateContact()` - Update existing contact
  - `getContact()` - Retrieve contact details
  - `addActivity()` - Log activity on a contact
  - `getWorkspaceInfo()` - Get current workspace details

**Key Methods:**
```typescript
static getAuthorizationUrl(config, state) // Generate OAuth URL
static exchangeCodeForToken(code, config) // Exchange auth code for tokens
async refreshAccessToken(config) // Refresh expired tokens
async createContact(contactData) // Create CRM contact
async addActivity(contactId, activityData) // Log activity
```

#### 2. **CRM Sync Service** (`lib/crmSync.ts`)
- Core synchronization logic
- Manages CRM connections and field mappings
- Handles lead-to-contact sync on approval
- Manages sync status and error tracking

**Key Methods:**
```typescript
async getCRMConnection(userId) // Get user's CRM connection
async saveCRMConnection() // Save/update CRM connection
async syncLeadOnApproval(userId, lead) // Sync approved lead to CRM
async addActivityToContact() // Log activity to CRM contact
async getLeadSyncStatus() // Get sync status for a lead
async updateFieldMapping() // Update field mapping
```

#### 3. **Activity Sync Helper** (`lib/activitySync.ts`)
- Simplified interface for logging activities
- Batch activity processing
- Specific methods for email and LinkedIn activities

**Key Methods:**
```typescript
async logActivityToCRM(event) // Generic activity logging
async logEmailOpen() // Log email open event
async logEmailReply() // Log email reply event
async logLinkedInConnection() // Log LinkedIn connection
async logActivitiesBatch() // Batch log multiple activities
```

### API Routes

#### CRM Routes (`routes/crm.ts`)
```
GET    /api/crm/authorize/attio              // Get OAuth authorization URL
POST   /api/crm/callback/attio               // Handle OAuth callback
GET    /api/crm/connection                   // Get CRM connection status
PATCH  /api/crm/field-mapping                // Update field mapping
DELETE /api/crm/connection                   // Disconnect CRM
GET    /api/leads/:id/crm-sync-status        // Get lead sync status
POST   /api/leads/:id/sync-to-crm            // Manually sync a lead
```

#### Activity Routes (`routes/activities.ts`)
```
POST   /api/leads/:id/log-activity           // Log generic activity
POST   /api/leads/:id/log-email-open         // Log email open
POST   /api/leads/:id/log-email-reply        // Log email reply
POST   /api/leads/:id/log-linkedin-connection // Log LinkedIn connection
```

#### Modified Lead Routes
```
PATCH  /api/leads/:id/review                 // Auto-triggers CRM sync on approval
```

### Frontend Components

#### 1. **AttioConnect** (`components/crm/AttioConnect.tsx`)
- OAuth connection button and UI
- Shows connection status
- Disconnect functionality
- Displays workspace information

#### 2. **FieldMapper** (`components/crm/FieldMapper.tsx`)
- Interactive field mapping UI
- Toggle fields for sync to CRM
- Visual feedback on selections

#### 3. **SyncStatusBadge** (`components/crm/SyncStatusBadge.tsx`)
- Display lead sync status
- Shows: synced, not_synced, pending, error
- Display error messages and sync timestamp

### API Client Hooks (`lib/api-client-react/src/crm-hooks.ts`)

Custom React Query hooks for CRM operations:

```typescript
useGetCRMAuthUrl()           // Get authorization URL
useConnectCRM()              // Handle OAuth callback
useGetCRMConnection()        // Get connection status
useUpdateFieldMapping()      // Update field mapping
useDisconnectCRM()          // Disconnect CRM
useGetLeadSyncStatus()      // Get lead sync status
useSyncLeadToCRM()          // Manual lead sync
```

### Frontend Pages

#### Settings Page (`pages/dashboard/Settings.tsx`)
- New "CRM" tab in settings
- AttioConnect component for OAuth flow
- FieldMapper component for customizing field sync
- Integration with all CRM hooks

#### OAuth Callback Page (`pages/AttioCallback.tsx`)
- Handles Attio OAuth redirect
- Exchanges code for tokens
- Communicates result back to Settings page
- Auto-closes after success

## Data Flow

### 1. OAuth Connection Flow
```
User clicks "Connect with Attio" 
    ↓
Frontend calls /api/crm/authorize/attio
    ↓
Gets authorization URL, opens OAuth window
    ↓
User logs in to Attio, grants permissions
    ↓
Attio redirects to AttioCallback page
    ↓
CallbackPage exchanges code for tokens via /api/crm/callback/attio
    ↓
Backend saves CRM connection to database
    ↓
Frontend receives success, notifies user
```

### 2. Lead Approval & Sync Flow
```
User approves a lead in HubCredo
    ↓
PATCH /api/leads/:id/review with review_status="approved"
    ↓
Lead review is updated in database
    ↓
Backend checks for CRM connection
    ↓
If connected: Gets field mapping, builds contact data
    ↓
Calls Attio API to create contact
    ↓
Updates lead with crm_contact_id and crm_sync_status="synced"
    ↓
If error: Sets crm_sync_status="error", crm_sync_error=message
```

### 3. Activity Sync Flow
```
Email tracking service detects email open/reply
    ↓
OR LinkedIn integration detects connection acceptance
    ↓
Application calls POST /api/leads/:id/log-email-open (or other activity)
    ↓
Backend retrieves lead and checks crm_contact_id
    ↓
If synced: Calls Attio API to add activity
    ↓
Activity appears in Attio contact timeline
```

## Database Schema

### crm_connections Table
```sql
CREATE TABLE IF NOT EXISTS crm_connections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL,
  crm_type      TEXT NOT NULL DEFAULT 'attio',
  access_token  TEXT NOT NULL,
  refresh_token TEXT,
  workspace_id  TEXT,
  field_mapping JSONB NOT NULL DEFAULT '{...}'::jsonb,
  connected_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, crm_type)
);
```

### Updates to leads Table
```sql
ALTER TABLE leads ADD COLUMN IF NOT EXISTS crm_contact_id  TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS crm_sync_status TEXT DEFAULT 'not_synced';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS crm_sync_error  TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS crm_synced_at   TIMESTAMPTZ;
```

## Environment Setup

### Backend Environment Variables
```env
# Attio OAuth Configuration
ATTIO_CLIENT_ID=your_client_id_from_attio
ATTIO_CLIENT_SECRET=your_client_secret_from_attio
ATTIO_REDIRECT_URI=http://localhost:5173/attio-callback  # For dev
ATTIO_REDIRECT_URI=https://yourdomain.com/attio-callback  # For prod
```

### Getting Attio OAuth Credentials
1. Go to [Attio Developer Console](https://console.attio.com)
2. Create a new OAuth application
3. Set redirect URI to `http://localhost:5173/attio-callback` for development
4. Copy client ID and secret to your `.env` file

## Usage Guide

### For Users

#### 1. Connect Attio
1. Go to Settings → CRM tab
2. Click "Connect with Attio"
3. Log in to your Attio account
4. Grant HubCredo access to your workspace
5. Configure field mapping (optional, defaults are recommended)

#### 2. Field Mapping
1. In Settings → CRM → Field Mapper
2. Toggle fields you want synced to Attio
3. Email is required for sync to work
4. Click "Save field mapping"

#### 3. Auto-Sync on Approval
1. When you approve a lead in HubCredo
2. Contact is automatically created in Attio
3. Check lead card for sync status badge

#### 4. Activity Tracking
1. Email opens, replies are logged automatically
2. LinkedIn connections are logged when detected
3. All activities appear in Attio contact timeline

### For Developers

#### Manual Lead Sync
```bash
curl -X POST http://localhost:3000/api/leads/{leadId}/sync-to-crm \
  -H "Authorization: Bearer {token}"
```

#### Log Email Activity
```bash
curl -X POST http://localhost:3000/api/leads/{leadId}/log-email-open \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {token}" \
  -d '{
    "email_id": "email_123",
    "timestamp": "2024-06-07T10:30:00Z"
  }'
```

#### Log LinkedIn Activity
```bash
curl -X POST http://localhost:3000/api/leads/{leadId}/log-linkedin-connection \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {token}" \
  -d '{
    "linkedin_url": "https://linkedin.com/in/username",
    "timestamp": "2024-06-07T10:30:00Z"
  }'
```

#### Get Sync Status
```bash
curl http://localhost:3000/api/leads/{leadId}/crm-sync-status \
  -H "Authorization: Bearer {token}"
```

## Error Handling

### Sync Errors
- **"CRM not connected"**: User hasn't connected Attio yet
- **"Failed to create contact"**: Attio API error, check field mapping
- **"Lead not found"**: Lead doesn't exist or user doesn't own it
- **"Lead already synced"**: Can't sync a lead that's already synced

### Activity Errors
- **"Lead not synced to CRM"**: Activity not logged because lead isn't in Attio
- **"Contact not found"**: CRM contact ID is invalid
- **HTTP 401/403**: Authentication error, refresh token may be expired

### Token Refresh
The system automatically refreshes expired access tokens using the refresh token. If refresh fails, user needs to reconnect Attio.

## Testing

### Test OAuth Flow
1. Create a test Attio workspace
2. Register OAuth app in developer console
3. Set redirect URI to localhost
4. Test connection in Settings page

### Test Lead Sync
1. Connect Attio
2. Create a lead in HubCredo
3. Approve the lead
4. Check Attio - contact should appear within seconds

### Test Activity Logging
1. Use the API endpoints above to log activities
2. Check Attio contact timeline
3. Activities should appear with correct timestamps

### Debug Logs
Check server logs for:
- `CRM connected` - OAuth success
- `Lead synced to CRM` - Lead sync success
- `Activity added to contact` - Activity logged
- Error messages for any failures

## Best Practices

1. **Always validate field mapping** before syncing large lead batches
2. **Use email as primary identifier** - Attio uses email for deduplication
3. **Test with a single lead first** before connecting production workflows
4. **Monitor sync status badges** on leads for any errors
5. **Regular token refresh** - System handles this automatically
6. **Batch activity logging** when processing multiple activities
7. **Implement retry logic** for failed syncs in your integrations

## Limitations & Notes

- OAuth tokens are stored encrypted in the database
- Refresh tokens may expire (depends on Attio policy)
- Field mapping is per-user, not per-CRM
- Sync is one-way: HubCredo → Attio (no reverse sync yet)
- Custom fields not yet supported (only standard fields)
- Rate limiting: Follow Attio API rate limits (typically 300 req/min)

## Future Enhancements

- [ ] Two-way sync (Attio → HubCredo)
- [ ] Custom field mapping support
- [ ] Multi-CRM support (Pipedrive, HubSpot)
- [ ] Batch lead import from Attio
- [ ] Activity sync from email service providers
- [ ] Webhook-based activity updates
- [ ] Contact deduplication settings
- [ ] Sync history audit log

## Troubleshooting

### "OAuth window won't open"
- Check browser popup blocker settings
- Verify redirect URI matches OAuth app config

### "Connection fails immediately after OAuth"
- Verify ATTIO_CLIENT_SECRET is correct
- Check ATTIO_REDIRECT_URI is exactly right
- Look at server logs for detailed error

### "Leads not syncing on approval"
- Check user has CRM connected
- Verify field mapping is valid
- Check lead has required fields (email, first name, last name)
- Look for errors in crm_sync_error column in database

### "Activities not logging"
- Verify lead is synced (crm_contact_id should have value)
- Check Attio API is responding normally
- Look at activity route response for specific error

## Support

For issues or questions:
1. Check the logs first
2. Verify all environment variables are set
3. Test OAuth connection
4. Check Attio API status
5. Review this documentation completely
