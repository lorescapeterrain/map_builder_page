# Admin Panel - Lorescape Map Builder

## 🔐 Access

Admin panel is available at: **http://localhost:5173/admin.html**

## 🚀 Setup

### 1. Set Admin Token

Create a `.env` file in the project root:

```bash
ADMIN_TOKEN=your-secure-admin-token-here
```

⚠️ **Important:** Use a strong, unique token! This protects all admin operations.

### 2. Start Servers

```bash
# Terminal 1 - Backend API
cd server
node index.js

# Terminal 2 - Frontend (Vite)
npm run dev
```

### 3. Access Admin Panel

1. Open: http://localhost:5173/admin.html
2. Enter your admin token
3. You're in! 🎉

## 📊 Features

### Dashboard
- **Total Maps** - Number of saved maps
- **Total Tiles** - All tiles across all maps
- **Storage Used** - Disk space consumption

### Map Management

#### 🔍 Search & Filter
- Search by map name or ID
- Real-time filtering

#### ✏️ Rename Maps
- Click edit icon
- Change map name
- Updates both file and index

#### ⬇️ Download Maps
- Download any map as `.lsm` file
- Filename format: `mapname_id.lsm`

#### 🔗 Share Links
- Get shareable URL
- Automatically copied to clipboard
- Format: `/?share=map-id`

#### 🗑️ Delete Maps
- Remove unwanted maps
- Confirmation required
- Deletes both file and index entry

## 🔒 Security

### Authentication
- Token-based authentication
- Token sent in `X-Admin-Token` header
- All admin endpoints protected

### API Endpoints

```
GET    /api/admin/maps              - List all maps
DELETE /api/admin/maps/:id          - Delete map
PUT    /api/admin/maps/:id          - Rename map
GET    /api/admin/maps/:id/download - Download map file
```

### Token Methods

**Header (recommended):**
```javascript
fetch('/api/admin/maps', {
  headers: { 'X-Admin-Token': 'your-token' }
})
```

**Query parameter (for downloads):**
```
/api/admin/maps/:id/download?adminToken=your-token
```

## 🎨 Features

- **Dark/Light Theme** - Toggle with moon icon
- **Responsive Design** - Works on all screen sizes
- **Real-time Search** - Instant filtering
- **Toast Notifications** - Visual feedback for all actions
- **Keyboard Shortcuts** - ESC to close modals

## 📝 Map Data Structure

Each map index entry contains:
```json
{
  "id": "abc123",
  "name": "My Awesome Map",
  "tileCount": 42,
  "sizeBytes": 15360,
  "createdAt": "2025-10-16T19:30:00.000Z",
  "accessCount": 5
}
```

## 🛠️ Troubleshooting

### "Admin API is disabled"
- You haven't set `ADMIN_TOKEN` in `.env`
- Solution: Add `ADMIN_TOKEN=your-token` to `.env` and restart backend

### "Unauthorized"
- Wrong token entered
- Solution: Check your `.env` file for correct token

### "Failed to refresh maps"
- Backend server not running
- Solution: Start backend with `cd server && node index.js`

### Maps not showing
- Check browser console for errors
- Verify backend is running on port 8787
- Check `server/storage/index.json` exists

## 🔧 Configuration

### Change Backend Port

In `.env`:
```bash
PORT=9000
```

### Increase Upload Limit

In `.env`:
```bash
MAX_PAYLOAD_BYTES=1048576  # 1MB
```

### Custom Storage Location

In `.env`:
```bash
MAP_DATA_DIR=/custom/path/to/storage
```

## 📊 Statistics

The admin panel automatically calculates:
- Number of saved maps
- Total tiles across all maps
- Storage space used (in KB/MB)
- Access count per map
- Creation timestamps

## 🚀 Production Deployment

1. Set strong `ADMIN_TOKEN`
2. Configure `ALLOWED_ORIGINS` in `.env`
3. Use HTTPS in production
4. Never commit `.env` to git
5. Backup `server/storage/` regularly

## 💡 Tips

- Use the search to find maps quickly
- Download maps before deleting as backup
- Monitor storage usage to prevent disk issues
- Access count shows map popularity
- Rename maps to organize better

## 🆘 Support

If you encounter issues:
1. Check browser console (F12)
2. Check backend logs in terminal
3. Verify `.env` configuration
4. Ensure ports 5173 and 8787 are free
