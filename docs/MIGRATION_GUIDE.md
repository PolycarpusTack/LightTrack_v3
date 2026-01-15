# LightTrack Migration Guide

This guide provides step-by-step instructions for migrating your LightTrack installation to version 3.0.0 and covers all breaking changes, troubleshooting steps, and best practices.

## Overview

LightTrack v3.0.0 introduces significant architectural improvements including:
- Enhanced memory management with comprehensive cleanup systems
- Improved error handling with circuit breakers and fallback mechanisms
- New unified UI components with better accessibility
- Advanced storage optimization with 99%+ compression
- Complete test coverage with integration testing

## Pre-Migration Requirements

### System Requirements
- **Node.js**: 16.0 or higher
- **Memory**: 4GB RAM minimum (8GB recommended)
- **Disk Space**: 1GB free space for migration process
- **Operating System**: Windows 10/11, macOS 10.15+, or Linux Ubuntu 18.04+

### Data Backup
**CRITICAL**: Always backup your data before migration.

```bash
# Create backup directory
mkdir lighttrack-backup-$(date +%Y%m%d)

# Backup user data (adjust path for your OS)
# Windows
cp -r "%APPDATA%/LightTrack" lighttrack-backup-$(date +%Y%m%d)/

# macOS
cp -r "~/Library/Application Support/LightTrack" lighttrack-backup-$(date +%Y%m%d)/

# Linux
cp -r "~/.config/LightTrack" lighttrack-backup-$(date +%Y%m%d)/
```

### Pre-Migration Checklist
- [ ] Stop LightTrack application completely
- [ ] Backup all user data and settings
- [ ] Note current version (`Help > About`)
- [ ] Export activities if needed (`File > Export > Activities`)
- [ ] Document custom configurations
- [ ] Close all related applications

## Migration Process

### Step 1: Download and Prepare

1. Download LightTrack v3.0.0 from the official release page
2. Verify the download integrity:
   ```bash
   # Check SHA256 hash (provided with release)
   sha256sum LightTrack-3.0.0-Setup.exe
   ```

### Step 2: Installation

#### Fresh Installation (Recommended)
```bash
# Uninstall previous version first
# Windows: Use Control Panel > Programs
# macOS: Move old app to Trash
# Linux: Use package manager

# Install new version
./LightTrack-3.0.0-Setup.exe  # Windows
# or
open LightTrack-3.0.0.dmg     # macOS
# or
sudo dpkg -i lighttrack_3.0.0_amd64.deb  # Linux
```

#### In-Place Upgrade
```bash
# Stop LightTrack service
killall LightTrack

# Run installer (will detect existing installation)
./LightTrack-3.0.0-Setup.exe --upgrade
```

### Step 3: Data Migration

LightTrack v3.0.0 includes an automatic migration system that runs on first startup.

1. **Start LightTrack v3.0.0**
   - The migration wizard will appear automatically
   - Do not close the application during migration

2. **Migration Process**
   ```
   [Migration Wizard]
   ├── Data Detection (scans for v2.x data)
   ├── Backup Creation (creates safety backup)
   ├── Schema Upgrade (converts to v3.0 format)
   ├── Feature Migration (migrates custom settings)
   ├── Verification (validates migrated data)
   └── Cleanup (removes temporary files)
   ```

3. **Migration Time Estimates**
   - Small datasets (< 1000 activities): 30 seconds
   - Medium datasets (1000-10000 activities): 2-5 minutes  
   - Large datasets (> 10000 activities): 5-15 minutes

### Step 4: Verification

After migration completes:

1. **Verify Data Integrity**
   ```bash
   # Check activity count
   Navigate to Activities page
   Compare count with pre-migration export
   
   # Verify settings
   Open Settings > General
   Confirm all preferences migrated correctly
   
   # Test core functionality
   Start/stop tracking
   Create manual entry
   Export activities
   ```

2. **Performance Check**
   - Application startup time should be < 3 seconds
   - UI interactions should respond within 150ms
   - Memory usage should be < 100MB

## Breaking Changes

### Configuration Changes

#### Settings Structure
**Before (v2.x):**
```json
{
  "settings": {
    "theme": "dark",
    "autoSave": true,
    "trackingInterval": 60
  }
}
```

**After (v3.0):**
```json
{
  "settings": {
    "ui": {
      "theme": "dark",
      "sidebarCollapsed": false
    },
    "tracking": {
      "autoSave": true,
      "interval": 60,
      "idleThreshold": 180
    },
    "storage": {
      "compression": true,
      "retentionDays": 90
    }
  }
}
```

**Migration Action**: Settings are automatically migrated. Review and update any custom configurations.

#### API Changes

**Deprecated APIs (removed in v3.0):**
```javascript
// OLD - No longer available
window.lightTrackAPI.getActivities()
window.lightTrackAPI.saveActivity()

// NEW - Replacement APIs
window.lightTrackAPI.activities.get()
window.lightTrackAPI.activities.saveManual()
```

**Updated IPC Channels:**
```javascript
// OLD
ipcRenderer.invoke('get-activities')

// NEW  
ipcRenderer.invoke('activities:get')
```

### Database Schema Changes

#### Activity Model Updates
```javascript
// Added fields in v3.0
{
  "actualDuration": 1800,        // NEW: excludes idle time
  "doNotTrack": false,           // NEW: privacy settings
  "doNotTrackCategory": null,    // NEW: categorization
  "mergedCount": 1,              // NEW: consolidation tracking
  "errorRecovery": null          // NEW: error handling data
}
```

#### Project Configuration
```javascript
// Enhanced project mapping in v3.0
{
  "projectMappings": {
    "Development": {
      "sapCode": "DEV001",         // NEW
      "costCenter": "CC-100",      // NEW
      "billable": true,
      "wbsElement": "WBS-DEV"      // NEW
    }
  }
}
```

### UI Component Changes

#### Sidebar Navigation
- **Breaking**: Custom sidebar extensions need updates
- **Action**: Update to use new `UnifiedSidebar` component
- **API**: `window.sidebarAPI` → `window.lightTrackAPI.ui`

#### Modal System
- **Breaking**: Custom dialogs must use new `ModalManager`
- **Action**: Replace `electron.dialog` calls with `modalManager.open()`
- **API**: All modals now use unified system with accessibility features

### File Structure Changes

#### Installation Directory
```
LightTrack/
├── main.js (unchanged)
├── preload.js (enhanced APIs)
├── src/
│   ├── main/
│   │   ├── services/ (NEW: service architecture)
│   │   ├── utils/ (NEW: utility modules)
│   │   └── integration/ (NEW: migration system)
│   └── renderer/
│       ├── components/ (NEW: unified components)
│       └── store/ (NEW: state management)
└── ultra-efficiency/ (enhanced compression)
```

#### User Data Directory
```
# Old location (automatically migrated)
~/.lighttrack/

# New location
~/.config/LightTrack/
├── activities.db (migrated)
├── settings.json (migrated + enhanced)
├── projects.json (NEW)
├── cache/ (NEW: performance cache)
└── backups/ (NEW: automatic backups)
```

## Troubleshooting

### Common Migration Issues

#### Issue: Migration Wizard Doesn't Start
**Symptoms**: Application starts normally without showing migration dialog

**Solutions**:
1. Check if migration already completed:
   ```bash
   # Look for migration marker file
   ls ~/.config/LightTrack/.migration-complete
   ```

2. Force migration if needed:
   ```bash
   # Delete marker file and restart
   rm ~/.config/LightTrack/.migration-complete
   # Restart LightTrack
   ```

3. Manual data import:
   ```bash
   # Use backup data
   LightTrack --import-backup /path/to/backup
   ```

#### Issue: Data Not Found During Migration
**Symptoms**: "No previous data found" message

**Solutions**:
1. Specify data location manually:
   ```bash
   LightTrack --data-path "/custom/path/to/data"
   ```

2. Import from backup:
   ```bash
   LightTrack --import-activities "/path/to/activities.json"
   ```

3. Check for hidden directories:
   ```bash
   # Enable hidden file visibility
   ls -la ~/Library/Application\ Support/  # macOS
   ls -la ~/.config/                       # Linux
   dir /ah %APPDATA%                       # Windows
   ```

#### Issue: Migration Fails Midway
**Symptoms**: Progress bar stops, error messages appear

**Solutions**:
1. **Check disk space**:
   ```bash
   df -h  # Linux/macOS
   # Ensure at least 500MB free space
   ```

2. **Check permissions**:
   ```bash
   # Fix permissions (Linux/macOS)
   chmod -R 755 ~/.config/LightTrack/
   chown -R $USER ~/.config/LightTrack/
   ```

3. **Safe mode migration**:
   ```bash
   LightTrack --safe-migration --verbose
   ```

4. **Manual rollback**:
   ```bash
   # Stop LightTrack
   killall LightTrack
   
   # Restore from backup
   rm -rf ~/.config/LightTrack/
   cp -r /path/to/backup ~/.config/LightTrack/
   
   # Retry migration
   LightTrack --force-migration
   ```

#### Issue: Performance Degradation After Migration
**Symptoms**: Slow startup, high memory usage, UI lag

**Solutions**:
1. **Clear cache and rebuild**:
   ```bash
   # Clear performance cache
   rm -rf ~/.config/LightTrack/cache/
   
   # Restart with cache rebuild
   LightTrack --rebuild-cache
   ```

2. **Optimize database**:
   ```bash
   LightTrack --optimize-database
   ```

3. **Reset UI preferences**:
   ```bash
   # Backup settings first
   cp ~/.config/LightTrack/settings.json ~/settings-backup.json
   
   # Reset UI settings
   LightTrack --reset-ui-settings
   ```

#### Issue: Settings Not Migrated Correctly
**Symptoms**: Default settings loaded, custom preferences lost

**Solutions**:
1. **Manual settings import**:
   ```javascript
   // In LightTrack console (Ctrl+Shift+I)
   const backupSettings = {
     // Your old settings here
   };
   window.lightTrackAPI.settings.import(backupSettings);
   ```

2. **Restore from backup**:
   ```bash
   # Find backup settings
   cat /path/to/backup/settings.json
   
   # Manual restore via UI
   # Settings > Import/Export > Import Settings
   ```

### Error Codes and Solutions

#### Error: MIGRATION_001
**Description**: "Cannot locate previous installation"
**Solution**: 
```bash
LightTrack --scan-data-locations
# Follow prompts to specify correct location
```

#### Error: MIGRATION_002  
**Description**: "Database schema incompatible"
**Solution**:
```bash
# Force schema conversion
LightTrack --force-schema-upgrade --backup-first
```

#### Error: MIGRATION_003
**Description**: "Insufficient disk space"
**Solution**:
```bash
# Free up space, then retry
df -h
# Clean up old files, then:
LightTrack --resume-migration
```

#### Error: MIGRATION_004
**Description**: "Permission denied accessing data files"
**Solution**:
```bash
# Fix permissions (Linux/macOS)
sudo chown -R $USER ~/.config/LightTrack/
chmod -R 755 ~/.config/LightTrack/

# Windows: Run as Administrator
```

### Recovery Procedures

#### Complete Migration Failure
If migration completely fails and data is corrupted:

1. **Stop all LightTrack processes**
2. **Restore from backup**:
   ```bash
   # Remove corrupted data
   rm -rf ~/.config/LightTrack/
   
   # Restore backup
   cp -r /path/to/backup ~/.config/LightTrack/
   ```

3. **Manual migration approach**:
   ```bash
   # Install fresh v3.0.0
   # Import data manually
   LightTrack --import-mode
   ```

#### Partial Data Loss
If some data is lost during migration:

1. **Check automatic backups**:
   ```bash
   ls ~/.config/LightTrack/backups/
   # Look for pre-migration backup
   ```

2. **Merge data from backup**:
   ```bash
   LightTrack --merge-backup /path/to/backup
   ```

3. **Manual data reconstruction**:
   - Export remaining data
   - Manually edit JSON files
   - Re-import using bulk import tool

## Post-Migration Steps

### Validation Checklist
- [ ] All activities imported correctly
- [ ] Settings and preferences preserved
- [ ] Custom projects and mappings working
- [ ] Tracking functionality operational
- [ ] Export/import features working
- [ ] Performance within acceptable limits
- [ ] No error messages in console

### Optimization Steps

1. **Enable Ultra-Efficiency Features**:
   ```bash
   # In Settings > Advanced
   Enable "Ultra-compression storage"
   Enable "Smart memory management"
   Enable "Performance monitoring"
   ```

2. **Configure New Features**:
   ```bash
   # Set up error recovery
   Settings > System > Error Handling
   
   # Configure backup schedule
   Settings > Data > Automatic Backups
   
   # Optimize for your usage pattern
   Settings > Performance > Usage Profile
   ```

3. **Test New Capabilities**:
   - Try the new unified dashboard
   - Test modal dialogs and accessibility
   - Verify error recovery works
   - Check performance monitoring

### Clean Up Old Installation

After confirming migration success:

1. **Remove old data** (optional):
   ```bash
   # Only after confirming everything works
   rm -rf /old/lighttrack/data/location
   ```

2. **Update integrations**:
   - Browser extensions
   - Third-party tools
   - Custom scripts using LightTrack APIs

3. **Update documentation**:
   - Internal procedures
   - User guides
   - API integration guides

## Rollback Procedure

If you need to revert to v2.x:

### Prerequisites
- Original v2.x backup
- v2.x installer
- Understanding that v3.0 data cannot be used in v2.x

### Rollback Steps

1. **Stop LightTrack v3.0**:
   ```bash
   killall LightTrack
   ```

2. **Uninstall v3.0**:
   ```bash
   # Use system uninstaller
   # Or manual removal
   ```

3. **Restore v2.x data**:
   ```bash
   # Remove v3.0 data
   rm -rf ~/.config/LightTrack/
   
   # Restore v2.x backup
   cp -r /path/to/v2x-backup ~/.lighttrack/
   ```

4. **Reinstall v2.x**:
   ```bash
   # Use original v2.x installer
   ./LightTrack-2.x.x-Setup.exe
   ```

**Warning**: This will lose any data created in v3.0 after migration.

## Support and Resources

### Getting Help
- **Documentation**: `/docs` folder in installation
- **GitHub Issues**: [LightTrack Issues](https://github.com/lighttrack/issues)
- **Community Forum**: [LightTrack Discussions](https://github.com/lighttrack/discussions)
- **Email Support**: support@lighttrack.app

### Debug Information Collection
When reporting issues, include:

```bash
# Generate debug report
LightTrack --generate-debug-report

# Output includes:
# - System information
# - Migration logs
# - Error logs
# - Performance metrics
# - Data integrity status
```

### Migration Logs
Check migration logs for detailed information:

```bash
# Location varies by OS
tail -f ~/.config/LightTrack/logs/migration.log    # Linux/macOS
type "%APPDATA%\LightTrack\logs\migration.log"     # Windows
```

## Best Practices

### Before Migration
1. **Plan migration during low-usage periods**
2. **Test on non-production system first**
3. **Document custom configurations**
4. **Ensure stable power supply**
5. **Close unnecessary applications**

### During Migration
1. **Do not interrupt the process**
2. **Monitor system resources**
3. **Keep backup accessible**
4. **Note any error messages**

### After Migration
1. **Validate all data thoroughly**
2. **Test all functionality**
3. **Update related systems**
4. **Train users on new features**
5. **Monitor performance over time**

---

**Migration Guide Version**: 3.0.0  
**Last Updated**: 2024-01-15  
**Covers**: LightTrack v2.x → v3.0.0  
**Status**: Complete