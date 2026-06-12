# CRM ConnectSync - Quick Start Guide

## 📋 Prerequisites

- Node.js 18+
- npm or pnpm
- Supabase database with migrations applied
- Attio account with workspace admin access

## 🚀 Setup Instructions

### Step 1: Database Migrations

Run the following SQL in your Supabase console to create the CRM connection table and update the leads table:

```sql
-- CRM connections table
CREATE TABLE IF NOT EXISTS crm_connections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL,
  crm_type      TEXT NOT NULL DEFAULT 'attio',
  access_token  TEXT NOT NULL,
  refresh_token TEXT,
  workspace_id  TEXT,
  field_mapping JSONB NOT NULL DEFAULT '{
    "first_name": true,
    "last_name": true,
    "email": true,
    "job_title": true,
    "company_name": true,
    "linkedin_url": true
  }'::jsonb,
  connected_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, crm_type)
);

-- Add CRM sync fields to leads table
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS crm_contact_id  TEXT,
  ADD COLUMN IF NOT EXISTS crm_sync_status TEXT DEFAULT 'not_synced',
  ADD COLUMN IF NOT EXISTS crm_sync_error  TEXT,
  ADD COLUMN IF NOT EXISTS crm_synced_at   TIMESTAMPTZ;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS crm_connections_user_id_idx ON crm_connections(user_id);
CREATE INDEX IF NOT EXISTS leads_crm_contact_id_idx ON leads(crm_contact_id);
CREATE INDEX IF NOT EXISTS leads_crm_sync_status_idx ON leads(crm_sync_status);
```

### Step 2: Attio OAuth Setup

1. **Create Attio Developer App:**
   - Go to [Attio Console](https://console.attio.com)
   - Navigate to Developers → Applications
   - Click "Create Application"
   - Fill in application details
   - Choose "Web application"

2. **Configure Redirect URI:**
   - For **Local Development**: `http://localhost:5173/attio-callback`
   - For **Production**: `https://yourdomain.com/attio-callback`

3. **Get Credentials:**
   - Copy the Client ID
   - Copy the Client Secret
   - Save these for the next step

### Step 3: Environment Configuration

**Backend (.env in `artifacts/api-server/`):**

```env
# Attio OAuth Configuration
ATTIO_CLIENT_ID=your_client_id_here
ATTIO_CLIENT_SECRET=your_client_secret_here
ATTIO_REDIRECT_URI=http://localhost:5173/attio-callback
```

**Frontend (.env in `artifacts/hubcredo/`):**

```env
REACT_APP_API_URL=http://localhost:3000/api
```

### Step 4: Install Dependencies & Start Servers

**Terminal 1 - Backend:**
```bash
cd artifacts/api-server
pnpm install
pnpm run dev
```

**Terminal 2 - Frontend:**
```bash
cd artifacts/hubcredo
pnpm install
pnpm run dev
```

The application should now be running at `http://localhost:5173`

## ✅ Verification Steps

### 1. Verify Database Tables
```sql
-- Check if CRM connections table exists
SELECT * FROM crm_connections LIMIT 1;

-- Check if leads table has CRM columns
SELECT crm_contact_id, crm_sync_status, crm_sync_error, crm_synced_at 
FROM leads LIMIT 1;
```

### 2. Test OAuth Flow
1. Go to Settings → CRM tab
2. Click "Connect with Attio"
3. You should be redirected to Attio login
4. Log in with your Attio account
5. You should see a success message
6. Connection status should show "Attio Connected"

### 3. Test Lead Sync
1. Create a test lead in HubCredo
2. Make sure it has: first name, last name, email, company
3. Approve the lead (change review status to "approved")
4. Check Attio - a new contact should appear within 5 seconds
5. On the lead card, you should see a green "Synced to CRM" badge

### 4. Check Sync Status
```bash
# Get sync status for a lead
curl http://localhost:3000/api/leads/{leadId}/crm-sync-status \
  -H "Authorization: Bearer {your_token}" \
  -H "Content-Type: application/json"

# Expected response:
{
  "status": "synced",
  "contactId": "attio_contact_id_here",
  "syncedAt": "2024-06-07T10:30:00Z"
}
```

## 📝 Test Scenarios

### Scenario 1: Basic Connection
- [ ] Connect Attio via OAuth
- [ ] See workspace name displayed
- [ ] See "Attio Connected" status

### Scenario 2: Field Mapping
- [ ] Disconnect Attio
- [ ] Reconnect with custom field mapping
- [ ] Uncheck some fields
- [ ] Save changes
- [ ] Verify mapping is saved in settings

### Scenario 3: Lead Sync
- [ ] Create a lead with all fields filled
- [ ] Approve the lead
- [ ] Within 5 seconds, check Attio
- [ ] New contact should exist with correct name and email
- [ ] Lead card should show "Synced to CRM" badge

### Scenario 4: Field Mapping in Action
- [ ] Create another lead
- [ ] Disable "job_title" in field mapper
- [ ] Approve the lead
- [ ] Check Attio contact - should NOT have job title
- [ ] Verify only enabled fields are synced

### Scenario 5: Activity Logging (for testing)
```bash
# Log email open
curl -X POST http://localhost:3000/api/leads/{leadId}/log-email-open \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {token}" \
  -d '{"email_id": "test_email_123"}'

# Check Attio contact - activity should appear in timeline
```

### Scenario 6: Error Handling
- [ ] Try syncing a lead without CRM connected (should fail gracefully)
- [ ] Try logging activity to non-synced lead (should fail gracefully)
- [ ] Disconnect CRM and try syncing (should show error)
- [ ] Check sync status shows proper error message

## 🔧 Troubleshooting

### "Connection refused" on API calls
- [ ] Verify backend is running on port 3000
- [ ] Check ATTIO_CLIENT_ID and ATTIO_CLIENT_SECRET are set
- [ ] Check server logs for errors

### "OAuth window doesn't open"
- [ ] Check browser console for errors
- [ ] Check if popup blocker is active
- [ ] Verify redirect URI in both code and Attio console

### "Cannot find module 'crm-hooks'"
- [ ] Rebuild the api-client-react package: `pnpm run build`
- [ ] Clear node_modules and reinstall: `pnpm install`

### "Lead not syncing on approval"
- [ ] Check server logs for sync errors
- [ ] Check database: is crm_contact_id populated?
- [ ] Check crm_sync_error column for error message
- [ ] Verify field mapping has email enabled

### "Activities not logging"
- [ ] Verify lead is synced: `crm_contact_id` should have a value
- [ ] Check server response for error message
- [ ] Verify Attio API is responding (check server logs)

## 📊 API Endpoints Summary

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/crm/authorize/attio` | Get OAuth authorization URL |
| POST | `/api/crm/callback/attio` | Handle OAuth callback |
| GET | `/api/crm/connection` | Get CRM connection status |
| PATCH | `/api/crm/field-mapping` | Update field mapping |
| DELETE | `/api/crm/connection` | Disconnect CRM |
| GET | `/api/leads/:id/crm-sync-status` | Get lead sync status |
| POST | `/api/leads/:id/sync-to-crm` | Manually sync a lead |
| POST | `/api/leads/:id/log-email-open` | Log email open |
| POST | `/api/leads/:id/log-email-reply` | Log email reply |
| POST | `/api/leads/:id/log-linkedin-connection` | Log LinkedIn connection |

## 🚀 Production Deployment

1. **Update environment variables:**
   - Set `ATTIO_REDIRECT_URI` to your production domain
   - Update `REACT_APP_API_URL` to production API endpoint

2. **Update Attio OAuth app:**
   - Add production redirect URI to approved list
   - Consider rotating client secret

3. **Database:**
   - Ensure migrations are applied to production database
   - Test backup/restore procedures

4. **Monitoring:**
   - Set up error tracking for sync failures
   - Monitor API rate limits
   - Log CRM sync events for auditing

## 📚 Additional Resources

- [Attio API Documentation](https://www.attio.com/developers)
- [CRM ConnectSync Documentation](./CRM_CONNECTSYNC_DOCUMENTATION.md)
- Check server logs: `artifacts/api-server/logs/`
- Check browser console for frontend errors

## 🎯 Next Steps

1. ✅ Complete all setup steps above
2. ✅ Run verification tests
3. ✅ Test all scenarios
4. ✅ Review production checklist
5. ✅ Deploy to production

Need help? Check the full documentation or server logs for detailed error messages.
