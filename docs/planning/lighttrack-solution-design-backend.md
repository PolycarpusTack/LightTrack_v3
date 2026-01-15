# LightTrack Backend Solution Design Document

## Overview
This document provides a comprehensive backend architecture design for LightTrack, detailing the server-side implementation, database schema, IPC communication layer, and integration points that support the frontend functionality described in `lighttrack-solution-design-frontend.md`.

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Database Design](#database-design)
3. [IPC Communication Layer](#ipc-communication-layer)
4. [Service Layer Architecture](#service-layer-architecture)
5. [Data Persistence Layer](#data-persistence-layer)
6. [Background Services](#background-services)
7. [Integration APIs](#integration-apis)
8. [Security & Authentication](#security--authentication)
9. [Performance & Optimization](#performance--optimization)
10. [Error Handling & Logging](#error-handling--logging)

## Architecture Overview

### Technology Stack
- **Main Process**: Electron (Node.js)
- **Database**: SQLite (local) with optional PostgreSQL (sync)
- **ORM**: TypeORM or Prisma
- **IPC**: Electron IPC with type-safe wrappers
- **Background Jobs**: Node.js Worker Threads
- **File Storage**: Local filesystem with configurable paths
- **Cache**: In-memory cache with LRU eviction
- **Logging**: Winston with rotating file logs

### Architectural Principles
- **Separation of Concerns**: Clear boundaries between layers
- **Event-Driven**: Reactive updates across components
- **CQRS Pattern**: Separate read/write operations for performance
- **Repository Pattern**: Abstract data access logic
- **Domain-Driven Design**: Business logic in domain services
- **Fail-Safe**: Graceful degradation with offline support

### Layer Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                    Renderer Process (Frontend)               │
├─────────────────────────────────────────────────────────────┤
│                    IPC Communication Layer                   │
├─────────────────────────────────────────────────────────────┤
│                    Main Process (Backend)                    │
├─────────────────┬─────────────────┬────────────────────────┤
│  API Handlers   │ Service Layer   │  Background Services   │
├─────────────────┼─────────────────┼────────────────────────┤
│              Repository Layer (Data Access)                  │
├─────────────────┴─────────────────┴────────────────────────┤
│                    Database Layer                            │
└─────────────────────────────────────────────────────────────┘
```

## Database Design

### Schema Overview

#### Activities Table
```sql
CREATE TABLE activities (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    project_id TEXT NOT NULL,
    category_id TEXT,
    start_time DATETIME NOT NULL,
    end_time DATETIME,
    duration INTEGER, -- milliseconds
    is_paused BOOLEAN DEFAULT FALSE,
    paused_duration INTEGER DEFAULT 0,
    pause_start_time DATETIME,
    application_name TEXT,
    window_title TEXT,
    is_manual_entry BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    sync_status TEXT DEFAULT 'pending', -- pending, synced, conflict
    sync_version INTEGER DEFAULT 1,
    metadata JSON,
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (category_id) REFERENCES categories(id),
    INDEX idx_activities_start_time (start_time),
    INDEX idx_activities_project_id (project_id),
    INDEX idx_activities_sync_status (sync_status)
);
```

#### Activity Tags Table (Many-to-Many)
```sql
CREATE TABLE activity_tags (
    activity_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (activity_id, tag_id),
    FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);
```

#### Projects Table
```sql
CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    color TEXT DEFAULT '#00bcd4',
    icon TEXT,
    is_archived BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    parent_id TEXT,
    client_id TEXT,
    budget_hours INTEGER,
    hourly_rate DECIMAL(10, 2),
    currency TEXT DEFAULT 'USD',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    metadata JSON,
    FOREIGN KEY (parent_id) REFERENCES projects(id),
    FOREIGN KEY (client_id) REFERENCES clients(id),
    INDEX idx_projects_name (name),
    INDEX idx_projects_archived (is_archived)
);
```

#### Tags Table
```sql
CREATE TABLE tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_tags_name (name)
);
```

#### Goals Table
```sql
CREATE TABLE goals (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL, -- daily, weekly, monthly, project
    target_type TEXT NOT NULL, -- hours, activities, productivity
    target_value DECIMAL(10, 2) NOT NULL,
    current_value DECIMAL(10, 2) DEFAULT 0,
    project_id TEXT,
    start_date DATE NOT NULL,
    end_date DATE,
    is_active BOOLEAN DEFAULT TRUE,
    is_completed BOOLEAN DEFAULT FALSE,
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    metadata JSON,
    FOREIGN KEY (project_id) REFERENCES projects(id),
    INDEX idx_goals_active (is_active),
    INDEX idx_goals_dates (start_date, end_date)
);
```

#### Analytics Cache Table
```sql
CREATE TABLE analytics_cache (
    id TEXT PRIMARY KEY,
    cache_key TEXT NOT NULL UNIQUE,
    cache_type TEXT NOT NULL, -- daily_stats, weekly_stats, monthly_stats
    date_range_start DATE NOT NULL,
    date_range_end DATE NOT NULL,
    data JSON NOT NULL,
    calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    INDEX idx_cache_key (cache_key),
    INDEX idx_cache_dates (date_range_start, date_range_end),
    INDEX idx_cache_expires (expires_at)
);
```

#### Settings Table
```sql
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    type TEXT NOT NULL, -- string, number, boolean, json
    category TEXT NOT NULL, -- general, tracking, sync, appearance
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_settings_category (category)
);
```

#### Export History Table
```sql
CREATE TABLE export_history (
    id TEXT PRIMARY KEY,
    export_type TEXT NOT NULL, -- csv, json, pdf, report
    date_range_start DATE NOT NULL,
    date_range_end DATE NOT NULL,
    filters JSON,
    file_path TEXT,
    file_size INTEGER,
    activity_count INTEGER,
    export_status TEXT NOT NULL, -- pending, completed, failed
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    INDEX idx_export_status (export_status),
    INDEX idx_export_created (created_at)
);
```

### Database Migrations System

```typescript
// src/main/database/migrations/Migration.ts
export interface Migration {
  version: number;
  name: string;
  up: (db: Database) => Promise<void>;
  down: (db: Database) => Promise<void>;
}

// src/main/database/migrations/001_initial_schema.ts
export const migration001: Migration = {
  version: 1,
  name: 'initial_schema',
  async up(db: Database) {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS activities (
        -- schema as defined above
      );
    `);
  },
  async down(db: Database) {
    await db.exec('DROP TABLE IF EXISTS activities;');
  }
};
```

## IPC Communication Layer

### IPC Handler Architecture

```typescript
// src/main/ipc/IPCHandler.ts
export interface IPCHandler {
  channel: string;
  handler: (event: IpcMainInvokeEvent, ...args: any[]) => Promise<any>;
  validator?: (args: any[]) => boolean;
  authorize?: (event: IpcMainInvokeEvent) => boolean;
}

// src/main/ipc/handlers/ActivityHandlers.ts
export class ActivityHandlers {
  private activityService: ActivityService;
  
  constructor(activityService: ActivityService) {
    this.activityService = activityService;
  }

  getHandlers(): IPCHandler[] {
    return [
      {
        channel: 'activity:start',
        handler: this.startActivity.bind(this),
        validator: (args) => args[0]?.name && typeof args[0].name === 'string'
      },
      {
        channel: 'activity:stop',
        handler: this.stopActivity.bind(this),
        validator: (args) => args[0] && typeof args[0] === 'string'
      },
      {
        channel: 'activity:pause',
        handler: this.pauseActivity.bind(this)
      },
      {
        channel: 'activity:resume',
        handler: this.resumeActivity.bind(this)
      },
      {
        channel: 'activity:merge',
        handler: this.mergeActivities.bind(this),
        validator: (args) => Array.isArray(args[0]) && args[0].length >= 2
      },
      {
        channel: 'activity:split',
        handler: this.splitActivity.bind(this),
        validator: (args) => args[0] && args[1] && new Date(args[1]).getTime() > 0
      },
      {
        channel: 'activity:export',
        handler: this.exportActivities.bind(this)
      },
      {
        channel: 'activity:bulkUpdate',
        handler: this.bulkUpdateActivities.bind(this)
      },
      {
        channel: 'activity:bulkDelete',
        handler: this.bulkDeleteActivities.bind(this)
      },
      {
        channel: 'activity:getTodayActivities',
        handler: this.getTodayActivities.bind(this)
      },
      {
        channel: 'activity:getFiltered',
        handler: this.getFilteredActivities.bind(this)
      },
      {
        channel: 'activity:add',
        handler: this.addActivity.bind(this)
      },
      {
        channel: 'activity:update',
        handler: this.updateActivity.bind(this)
      },
      {
        channel: 'activity:delete',
        handler: this.deleteActivity.bind(this)
      }
    ];
  }

  private async startActivity(event: IpcMainInvokeEvent, data: Partial<Activity>): Promise<Activity> {
    try {
      const activity = await this.activityService.startActivity(data);
      
      // Notify all renderer windows of the new activity
      this.broadcastUpdate('activity:started', activity);
      
      return activity;
    } catch (error) {
      this.handleError('Failed to start activity', error);
      throw error;
    }
  }

  private async mergeActivities(event: IpcMainInvokeEvent, activityIds: string[]): Promise<Activity> {
    try {
      // Validate activities exist and belong to same project
      const activities = await this.activityService.getActivitiesByIds(activityIds);
      
      if (activities.length !== activityIds.length) {
        throw new Error('One or more activities not found');
      }

      const projectIds = new Set(activities.map(a => a.projectId));
      if (projectIds.size > 1) {
        throw new Error('Cannot merge activities from different projects');
      }

      const mergedActivity = await this.activityService.mergeActivities(activityIds);
      
      // Notify about merge
      this.broadcastUpdate('activities:merged', {
        mergedActivity,
        deletedIds: activityIds.filter(id => id !== mergedActivity.id)
      });
      
      return mergedActivity;
    } catch (error) {
      this.handleError('Failed to merge activities', error);
      throw error;
    }
  }

  private async splitActivity(
    event: IpcMainInvokeEvent, 
    activityId: string, 
    splitTime: string
  ): Promise<Activity[]> {
    try {
      const activity = await this.activityService.getActivityById(activityId);
      
      if (!activity) {
        throw new Error('Activity not found');
      }

      const splitDate = new Date(splitTime);
      const startDate = new Date(activity.startTime);
      const endDate = activity.endTime ? new Date(activity.endTime) : new Date();

      if (splitDate <= startDate || splitDate >= endDate) {
        throw new Error('Split time must be within activity duration');
      }

      const newActivities = await this.activityService.splitActivity(activityId, splitTime);
      
      // Notify about split
      this.broadcastUpdate('activity:split', {
        originalId: activityId,
        newActivities
      });
      
      return newActivities;
    } catch (error) {
      this.handleError('Failed to split activity', error);
      throw error;
    }
  }

  private async exportActivities(
    event: IpcMainInvokeEvent,
    activityIds: string[],
    format: 'csv' | 'json' | 'pdf'
  ): Promise<ExportResult> {
    try {
      const exporter = this.getExporter(format);
      const result = await exporter.export(activityIds);
      
      // Track export in history
      await this.activityService.recordExport({
        activityIds,
        format,
        filePath: result.filePath,
        fileSize: result.fileSize
      });
      
      return result;
    } catch (error) {
      this.handleError('Failed to export activities', error);
      throw error;
    }
  }

  private broadcastUpdate(channel: string, data: any): void {
    BrowserWindow.getAllWindows().forEach(window => {
      window.webContents.send(channel, data);
    });
  }

  private handleError(message: string, error: any): void {
    logger.error(message, error);
    // Additional error handling logic
  }
}
```

### IPC Registration System

```typescript
// src/main/ipc/IPCRegistry.ts
export class IPCRegistry {
  private handlers: Map<string, IPCHandler> = new Map();

  register(handlers: IPCHandler[]): void {
    handlers.forEach(handler => {
      if (this.handlers.has(handler.channel)) {
        throw new Error(`Handler already registered for channel: ${handler.channel}`);
      }

      ipcMain.handle(handler.channel, async (event, ...args) => {
        try {
          // Validate arguments if validator provided
          if (handler.validator && !handler.validator(args)) {
            throw new Error('Invalid arguments');
          }

          // Check authorization if authorizer provided
          if (handler.authorize && !handler.authorize(event)) {
            throw new Error('Unauthorized');
          }

          // Execute handler
          const result = await handler.handler(event, ...args);
          
          return { success: true, data: result };
        } catch (error) {
          logger.error(`IPC Error [${handler.channel}]:`, error);
          return { 
            success: false, 
            error: error.message || 'Unknown error',
            code: error.code || 'UNKNOWN_ERROR'
          };
        }
      });

      this.handlers.set(handler.channel, handler);
    });
  }

  unregisterAll(): void {
    this.handlers.forEach((handler, channel) => {
      ipcMain.removeHandler(channel);
    });
    this.handlers.clear();
  }
}
```

## Service Layer Architecture

### Activity Service

```typescript
// src/main/services/ActivityService.ts
export class ActivityService extends EventEmitter {
  private static instance: ActivityService;
  private repository: ActivityRepository;
  private currentActivity: Activity | null = null;
  private trackingInterval: NodeJS.Timer | null = null;
  private autoSaveInterval: NodeJS.Timer | null = null;

  static getInstance(): ActivityService {
    if (!ActivityService.instance) {
      ActivityService.instance = new ActivityService();
    }
    return ActivityService.instance;
  }

  constructor() {
    super();
    this.repository = new ActivityRepository();
    this.setupAutoSave();
  }

  async startActivity(data: Partial<Activity>): Promise<Activity> {
    // Stop current activity if exists
    if (this.currentActivity) {
      await this.stopActivity(this.currentActivity.id);
    }

    const activity: Activity = {
      id: generateId(),
      name: data.name || 'Untitled Activity',
      projectId: data.projectId || 'default',
      startTime: new Date(),
      isPaused: false,
      pausedDuration: 0,
      isManualEntry: false,
      tags: data.tags || [],
      metadata: data.metadata || {},
      ...data
    };

    // Save to database
    const savedActivity = await this.repository.create(activity);
    this.currentActivity = savedActivity;

    // Start tracking
    this.startTracking();

    // Emit event
    this.emit('activityStarted', savedActivity);

    return savedActivity;
  }

  async stopActivity(activityId: string): Promise<Activity> {
    const activity = await this.repository.findById(activityId);
    
    if (!activity) {
      throw new Error('Activity not found');
    }

    // Calculate final duration
    const endTime = new Date();
    const duration = endTime.getTime() - new Date(activity.startTime).getTime() - activity.pausedDuration;

    const updatedActivity = await this.repository.update(activityId, {
      endTime,
      duration,
      isPaused: false
    });

    // Stop tracking if this was current
    if (this.currentActivity?.id === activityId) {
      this.stopTracking();
      this.currentActivity = null;
    }

    // Update analytics
    await this.updateDailyStats(updatedActivity);

    // Emit event
    this.emit('activityStopped', updatedActivity);

    return updatedActivity;
  }

  async pauseActivity(activityId: string): Promise<Activity> {
    const activity = await this.repository.findById(activityId);
    
    if (!activity || activity.isPaused) {
      throw new Error('Activity not found or already paused');
    }

    const updatedActivity = await this.repository.update(activityId, {
      isPaused: true,
      pauseStartTime: new Date()
    });

    if (this.currentActivity?.id === activityId) {
      this.currentActivity = updatedActivity;
    }

    this.emit('activityPaused', updatedActivity);

    return updatedActivity;
  }

  async resumeActivity(activityId: string): Promise<Activity> {
    const activity = await this.repository.findById(activityId);
    
    if (!activity || !activity.isPaused) {
      throw new Error('Activity not found or not paused');
    }

    const pauseDuration = Date.now() - new Date(activity.pauseStartTime!).getTime();
    const totalPausedDuration = activity.pausedDuration + pauseDuration;

    const updatedActivity = await this.repository.update(activityId, {
      isPaused: false,
      pausedDuration: totalPausedDuration,
      pauseStartTime: null
    });

    if (this.currentActivity?.id === activityId) {
      this.currentActivity = updatedActivity;
    }

    this.emit('activityResumed', updatedActivity);

    return updatedActivity;
  }

  async mergeActivities(activityIds: string[]): Promise<Activity> {
    const activities = await this.repository.findByIds(activityIds);
    
    if (activities.length < 2) {
      throw new Error('At least 2 activities required for merge');
    }

    // Sort by start time
    activities.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

    // Calculate merged properties
    const firstActivity = activities[0];
    const lastActivity = activities[activities.length - 1];
    
    const mergedName = activities.map(a => a.name).join(' + ');
    const mergedDescription = activities
      .map(a => a.description)
      .filter(Boolean)
      .join('\n\n');
    
    const totalDuration = activities.reduce((sum, a) => sum + (a.duration || 0), 0);
    const totalPausedDuration = activities.reduce((sum, a) => sum + a.pausedDuration, 0);
    
    // Merge tags
    const allTags = new Set<string>();
    activities.forEach(a => a.tags?.forEach(tag => allTags.add(tag)));

    // Create merged activity
    const mergedActivity: Activity = {
      id: generateId(),
      name: mergedName,
      description: mergedDescription,
      projectId: firstActivity.projectId,
      categoryId: firstActivity.categoryId,
      startTime: firstActivity.startTime,
      endTime: lastActivity.endTime || new Date(),
      duration: totalDuration,
      isPaused: false,
      pausedDuration: totalPausedDuration,
      applicationName: firstActivity.applicationName,
      windowTitle: firstActivity.windowTitle,
      isManualEntry: false,
      tags: Array.from(allTags),
      metadata: {
        mergedFrom: activityIds,
        mergedAt: new Date(),
        originalActivities: activities.map(a => ({
          id: a.id,
          name: a.name,
          duration: a.duration
        }))
      }
    };

    // Start transaction
    await this.repository.transaction(async (trx) => {
      // Create merged activity
      await this.repository.create(mergedActivity, trx);
      
      // Delete original activities
      await this.repository.deleteMany(activityIds, trx);
    });

    this.emit('activitiesMerged', { mergedActivity, deletedIds: activityIds });

    return mergedActivity;
  }

  async splitActivity(activityId: string, splitTime: string): Promise<Activity[]> {
    const activity = await this.repository.findById(activityId);
    
    if (!activity) {
      throw new Error('Activity not found');
    }

    const splitDate = new Date(splitTime);
    const startDate = new Date(activity.startTime);
    const endDate = activity.endTime ? new Date(activity.endTime) : new Date();

    // Calculate durations
    const firstDuration = splitDate.getTime() - startDate.getTime();
    const secondDuration = endDate.getTime() - splitDate.getTime();

    // Create two new activities
    const firstActivity: Activity = {
      ...activity,
      id: generateId(),
      endTime: splitDate,
      duration: firstDuration,
      metadata: {
        ...activity.metadata,
        splitFrom: activityId,
        splitPart: 1
      }
    };

    const secondActivity: Activity = {
      ...activity,
      id: generateId(),
      startTime: splitDate,
      endTime: endDate,
      duration: secondDuration,
      pausedDuration: 0, // Reset paused duration for second part
      metadata: {
        ...activity.metadata,
        splitFrom: activityId,
        splitPart: 2
      }
    };

    // Start transaction
    const newActivities = await this.repository.transaction(async (trx) => {
      // Delete original
      await this.repository.delete(activityId, trx);
      
      // Create new activities
      const first = await this.repository.create(firstActivity, trx);
      const second = await this.repository.create(secondActivity, trx);
      
      return [first, second];
    });

    this.emit('activitySplit', { originalId: activityId, newActivities });

    return newActivities;
  }

  async bulkUpdateActivities(
    activityIds: string[], 
    updates: Partial<Activity>
  ): Promise<Activity[]> {
    const updatedActivities = await this.repository.updateMany(activityIds, updates);
    
    this.emit('activitiesUpdated', updatedActivities);
    
    return updatedActivities;
  }

  async bulkDeleteActivities(activityIds: string[]): Promise<void> {
    await this.repository.deleteMany(activityIds);
    
    this.emit('activitiesDeleted', activityIds);
  }

  async getTodayActivities(): Promise<Activity[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return this.repository.findByDateRange(today, new Date());
  }

  async getFilteredActivities(filter: ActivityFilter): Promise<Activity[]> {
    return this.repository.findFiltered(filter);
  }

  private startTracking(): void {
    this.trackingInterval = setInterval(() => {
      if (this.currentActivity && !this.currentActivity.isPaused) {
        // Update application info
        this.updateApplicationInfo();
        
        // Check for idle
        this.checkIdleStatus();
      }
    }, 1000);
  }

  private stopTracking(): void {
    if (this.trackingInterval) {
      clearInterval(this.trackingInterval);
      this.trackingInterval = null;
    }
  }

  private async updateApplicationInfo(): Promise<void> {
    try {
      const activeWindow = await getActiveWindow();
      
      if (this.currentActivity && activeWindow) {
        this.currentActivity.applicationName = activeWindow.app;
        this.currentActivity.windowTitle = activeWindow.title;
        
        // Update in database periodically
        await this.repository.update(this.currentActivity.id, {
          applicationName: activeWindow.app,
          windowTitle: activeWindow.title
        });
      }
    } catch (error) {
      logger.error('Failed to update application info:', error);
    }
  }

  private setupAutoSave(): void {
    this.autoSaveInterval = setInterval(() => {
      if (this.currentActivity && !this.currentActivity.isPaused) {
        this.autoSaveCurrentActivity();
      }
    }, 30000); // Auto-save every 30 seconds
  }

  private async autoSaveCurrentActivity(): Promise<void> {
    if (!this.currentActivity) return;

    try {
      const duration = Date.now() - new Date(this.currentActivity.startTime).getTime() - this.currentActivity.pausedDuration;
      
      await this.repository.update(this.currentActivity.id, {
        duration,
        metadata: {
          ...this.currentActivity.metadata,
          lastAutoSave: new Date()
        }
      });
    } catch (error) {
      logger.error('Auto-save failed:', error);
    }
  }

  private async updateDailyStats(activity: Activity): Promise<void> {
    // Update analytics cache
    const analyticsService = AnalyticsService.getInstance();
    await analyticsService.updateDailyStats(activity);
  }

  dispose(): void {
    this.stopTracking();
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }
    this.removeAllListeners();
  }
}
```

### Export Service

```typescript
// src/main/services/export/ExportService.ts
export interface ExportResult {
  filePath: string;
  fileSize: number;
  format: string;
  activityCount: number;
}

export abstract class BaseExporter {
  protected exportDir: string;

  constructor() {
    this.exportDir = path.join(app.getPath('documents'), 'LightTrack', 'exports');
    this.ensureExportDir();
  }

  abstract export(activityIds: string[]): Promise<ExportResult>;

  protected async getActivities(activityIds: string[]): Promise<Activity[]> {
    const repository = new ActivityRepository();
    return repository.findByIds(activityIds);
  }

  protected ensureExportDir(): void {
    if (!fs.existsSync(this.exportDir)) {
      fs.mkdirSync(this.exportDir, { recursive: true });
    }
  }

  protected generateFilename(extension: string): string {
    const timestamp = format(new Date(), 'yyyy-MM-dd_HH-mm-ss');
    return `lighttrack_export_${timestamp}.${extension}`;
  }
}

// src/main/services/export/CSVExporter.ts
export class CSVExporter extends BaseExporter {
  async export(activityIds: string[]): Promise<ExportResult> {
    const activities = await this.getActivities(activityIds);
    const filename = this.generateFilename('csv');
    const filePath = path.join(this.exportDir, filename);

    // CSV Headers
    const headers = [
      'Activity Name',
      'Project',
      'Start Time',
      'End Time',
      'Duration (minutes)',
      'Tags',
      'Application',
      'Description'
    ];

    // Create CSV content
    const csvContent = [
      headers.join(','),
      ...activities.map(activity => {
        const project = await this.getProjectName(activity.projectId);
        const duration = Math.round((activity.duration || 0) / 60000);
        
        return [
          this.escapeCSV(activity.name),
          this.escapeCSV(project),
          format(new Date(activity.startTime), 'yyyy-MM-dd HH:mm:ss'),
          activity.endTime ? format(new Date(activity.endTime), 'yyyy-MM-dd HH:mm:ss') : '',
          duration.toString(),
          this.escapeCSV(activity.tags?.join('; ') || ''),
          this.escapeCSV(activity.applicationName || ''),
          this.escapeCSV(activity.description || '')
        ].join(',');
      })
    ].join('\n');

    // Write file
    await fs.promises.writeFile(filePath, csvContent, 'utf8');
    
    const stats = await fs.promises.stat(filePath);

    return {
      filePath,
      fileSize: stats.size,
      format: 'csv',
      activityCount: activities.length
    };
  }

  private escapeCSV(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  private async getProjectName(projectId: string): Promise<string> {
    const projectRepository = new ProjectRepository();
    const project = await projectRepository.findById(projectId);
    return project?.name || 'Unknown Project';
  }
}

// src/main/services/export/JSONExporter.ts
export class JSONExporter extends BaseExporter {
  async export(activityIds: string[]): Promise<ExportResult> {
    const activities = await this.getActivities(activityIds);
    const filename = this.generateFilename('json');
    const filePath = path.join(this.exportDir, filename);

    // Enrich activities with related data
    const enrichedActivities = await Promise.all(
      activities.map(async (activity) => {
        const project = await this.getProject(activity.projectId);
        const tags = await this.getTags(activity.id);
        
        return {
          ...activity,
          project,
          tags,
          formattedDuration: this.formatDuration(activity.duration || 0),
          exportedAt: new Date()
        };
      })
    );

    const exportData = {
      version: '1.0',
      exportDate: new Date(),
      activityCount: activities.length,
      totalDuration: activities.reduce((sum, a) => sum + (a.duration || 0), 0),
      activities: enrichedActivities,
      metadata: {
        appVersion: app.getVersion(),
        platform: process.platform,
        filters: { activityIds }
      }
    };

    // Write file with pretty formatting
    await fs.promises.writeFile(
      filePath, 
      JSON.stringify(exportData, null, 2), 
      'utf8'
    );
    
    const stats = await fs.promises.stat(filePath);

    return {
      filePath,
      fileSize: stats.size,
      format: 'json',
      activityCount: activities.length
    };
  }

  private formatDuration(milliseconds: number): string {
    const hours = Math.floor(milliseconds / 3600000);
    const minutes = Math.floor((milliseconds % 3600000) / 60000);
    const seconds = Math.floor((milliseconds % 60000) / 1000);
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
}

// src/main/services/export/PDFExporter.ts
export class PDFExporter extends BaseExporter {
  async export(activityIds: string[]): Promise<ExportResult> {
    const activities = await this.getActivities(activityIds);
    const filename = this.generateFilename('pdf');
    const filePath = path.join(this.exportDir, filename);

    // Create PDF document
    const doc = new PDFDocument();
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // Add header
    doc.fontSize(20).text('LightTrack Activity Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Generated on: ${format(new Date(), 'PPP')}`, { align: 'center' });
    doc.moveDown(2);

    // Add summary statistics
    const totalDuration = activities.reduce((sum, a) => sum + (a.duration || 0), 0);
    const uniqueProjects = new Set(activities.map(a => a.projectId)).size;
    
    doc.fontSize(14).text('Summary', { underline: true });
    doc.fontSize(12);
    doc.text(`Total Activities: ${activities.length}`);
    doc.text(`Total Time: ${this.formatDuration(totalDuration)}`);
    doc.text(`Projects: ${uniqueProjects}`);
    doc.moveDown(2);

    // Add activity details
    doc.fontSize(14).text('Activity Details', { underline: true });
    doc.moveDown();

    for (const activity of activities) {
      const project = await this.getProjectName(activity.projectId);
      
      doc.fontSize(12).text(activity.name, { bold: true });
      doc.fontSize(10);
      doc.text(`Project: ${project}`);
      doc.text(`Time: ${format(new Date(activity.startTime), 'PPp')} - ${activity.endTime ? format(new Date(activity.endTime), 'PPp') : 'Ongoing'}`);
      doc.text(`Duration: ${this.formatDuration(activity.duration || 0)}`);
      
      if (activity.tags?.length) {
        doc.text(`Tags: ${activity.tags.join(', ')}`);
      }
      
      if (activity.description) {
        doc.text(`Description: ${activity.description}`);
      }
      
      doc.moveDown();
    }

    // Finalize PDF
    doc.end();

    return new Promise((resolve) => {
      stream.on('finish', async () => {
        const stats = await fs.promises.stat(filePath);
        resolve({
          filePath,
          fileSize: stats.size,
          format: 'pdf',
          activityCount: activities.length
        });
      });
    });
  }
}
```

## Data Persistence Layer

### Repository Pattern Implementation

```typescript
// src/main/repositories/BaseRepository.ts
export abstract class BaseRepository<T extends { id: string }> {
  protected db: Database;
  protected tableName: string;

  constructor(tableName: string) {
    this.tableName = tableName;
    this.db = DatabaseManager.getInstance().getDatabase();
  }

  async findById(id: string): Promise<T | null> {
    const query = `SELECT * FROM ${this.tableName} WHERE id = ? AND is_deleted = 0`;
    const row = await this.db.get(query, [id]);
    return row ? this.mapRowToEntity(row) : null;
  }

  async findByIds(ids: string[]): Promise<T[]> {
    if (ids.length === 0) return [];
    
    const placeholders = ids.map(() => '?').join(',');
    const query = `SELECT * FROM ${this.tableName} WHERE id IN (${placeholders}) AND is_deleted = 0`;
    const rows = await this.db.all(query, ids);
    return rows.map(row => this.mapRowToEntity(row));
  }

  async create(entity: T, trx?: Transaction): Promise<T> {
    const db = trx || this.db;
    const columns = Object.keys(entity);
    const values = columns.map(col => entity[col]);
    const placeholders = columns.map(() => '?').join(',');
    
    const query = `INSERT INTO ${this.tableName} (${columns.join(',')}) VALUES (${placeholders})`;
    await db.run(query, values);
    
    return entity;
  }

  async update(id: string, updates: Partial<T>, trx?: Transaction): Promise<T> {
    const db = trx || this.db;
    const updateFields = Object.keys(updates)
      .map(key => `${key} = ?`)
      .join(', ');
    const values = [...Object.values(updates), id];
    
    const query = `UPDATE ${this.tableName} SET ${updateFields}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
    await db.run(query, values);
    
    return this.findById(id) as Promise<T>;
  }

  async delete(id: string, trx?: Transaction): Promise<void> {
    const db = trx || this.db;
    const query = `UPDATE ${this.tableName} SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
    await db.run(query, [id]);
  }

  async transaction<R>(callback: (trx: Transaction) => Promise<R>): Promise<R> {
    return this.db.transaction(callback);
  }

  protected abstract mapRowToEntity(row: any): T;
  protected abstract mapEntityToRow(entity: T): any;
}

// src/main/repositories/ActivityRepository.ts
export class ActivityRepository extends BaseRepository<Activity> {
  constructor() {
    super('activities');
  }

  async findByDateRange(startDate: Date, endDate: Date): Promise<Activity[]> {
    const query = `
      SELECT a.*, GROUP_CONCAT(at.tag_id) as tag_ids
      FROM activities a
      LEFT JOIN activity_tags at ON a.id = at.activity_id
      WHERE a.start_time >= ? AND a.start_time <= ? AND a.is_deleted = 0
      GROUP BY a.id
      ORDER BY a.start_time DESC
    `;
    
    const rows = await this.db.all(query, [
      startDate.toISOString(),
      endDate.toISOString()
    ]);
    
    return rows.map(row => this.mapRowToEntity(row));
  }

  async findFiltered(filter: ActivityFilter): Promise<Activity[]> {
    let query = `
      SELECT a.*, GROUP_CONCAT(at.tag_id) as tag_ids
      FROM activities a
      LEFT JOIN activity_tags at ON a.id = at.activity_id
      WHERE a.is_deleted = 0
    `;
    
    const params: any[] = [];
    
    if (filter.projectId) {
      query += ' AND a.project_id = ?';
      params.push(filter.projectId);
    }
    
    if (filter.startDate) {
      query += ' AND a.start_time >= ?';
      params.push(filter.startDate.toISOString());
    }
    
    if (filter.endDate) {
      query += ' AND a.start_time <= ?';
      params.push(filter.endDate.toISOString());
    }
    
    if (filter.search) {
      query += ' AND (a.name LIKE ? OR a.description LIKE ?)';
      const searchTerm = `%${filter.search}%`;
      params.push(searchTerm, searchTerm);
    }
    
    query += ' GROUP BY a.id ORDER BY a.start_time DESC';
    
    if (filter.limit) {
      query += ' LIMIT ?';
      params.push(filter.limit);
    }
    
    if (filter.offset) {
      query += ' OFFSET ?';
      params.push(filter.offset);
    }
    
    const rows = await this.db.all(query, params);
    return rows.map(row => this.mapRowToEntity(row));
  }

  async updateMany(ids: string[], updates: Partial<Activity>): Promise<Activity[]> {
    return this.transaction(async (trx) => {
      const updated: Activity[] = [];
      
      for (const id of ids) {
        const activity = await this.update(id, updates, trx);
        updated.push(activity);
      }
      
      return updated;
    });
  }

  async deleteMany(ids: string[], trx?: Transaction): Promise<void> {
    const db = trx || this.db;
    const placeholders = ids.map(() => '?').join(',');
    const query = `UPDATE activities SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`;
    await db.run(query, ids);
  }

  protected mapRowToEntity(row: any): Activity {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      projectId: row.project_id,
      categoryId: row.category_id,
      startTime: new Date(row.start_time),
      endTime: row.end_time ? new Date(row.end_time) : undefined,
      duration: row.duration,
      isPaused: Boolean(row.is_paused),
      pausedDuration: row.paused_duration,
      pauseStartTime: row.pause_start_time ? new Date(row.pause_start_time) : undefined,
      applicationName: row.application_name,
      windowTitle: row.window_title,
      isManualEntry: Boolean(row.is_manual_entry),
      tags: row.tag_ids ? row.tag_ids.split(',') : [],
      metadata: row.metadata ? JSON.parse(row.metadata) : {}
    };
  }

  protected mapEntityToRow(entity: Activity): any {
    return {
      id: entity.id,
      name: entity.name,
      description: entity.description,
      project_id: entity.projectId,
      category_id: entity.categoryId,
      start_time: entity.startTime.toISOString(),
      end_time: entity.endTime?.toISOString(),
      duration: entity.duration,
      is_paused: entity.isPaused ? 1 : 0,
      paused_duration: entity.pausedDuration,
      pause_start_time: entity.pauseStartTime?.toISOString(),
      application_name: entity.applicationName,
      window_title: entity.windowTitle,
      is_manual_entry: entity.isManualEntry ? 1 : 0,
      metadata: JSON.stringify(entity.metadata)
    };
  }
}
```

## Background Services

### Idle Detection Service

```typescript
// src/main/services/IdleDetectionService.ts
export class IdleDetectionService extends EventEmitter {
  private static instance: IdleDetectionService;
  private checkInterval: NodeJS.Timer | null = null;
  private idleThreshold: number = 300000; // 5 minutes default
  private lastActivity: Date = new Date();
  private isIdle: boolean = false;

  static getInstance(): IdleDetectionService {
    if (!IdleDetectionService.instance) {
      IdleDetectionService.instance = new IdleDetectionService();
    }
    return IdleDetectionService.instance;
  }

  start(): void {
    this.checkInterval = setInterval(() => {
      this.checkIdleStatus();
    }, 10000); // Check every 10 seconds

    // Listen to system events
    powerMonitor.on('suspend', () => this.handleSystemSuspend());
    powerMonitor.on('resume', () => this.handleSystemResume());
    powerMonitor.on('lock-screen', () => this.handleScreenLock());
    powerMonitor.on('unlock-screen', () => this.handleScreenUnlock());
  }

  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  private async checkIdleStatus(): Promise<void> {
    const idleTime = powerMonitor.getSystemIdleTime() * 1000; // Convert to milliseconds
    
    if (idleTime >= this.idleThreshold && !this.isIdle) {
      // Transitioned to idle
      this.isIdle = true;
      const idleStartTime = new Date(Date.now() - idleTime);
      this.emit('idle', { startTime: idleStartTime });
      
      // Auto-pause current activity
      const activityService = ActivityService.getInstance();
      const currentActivity = activityService.getCurrentActivity();
      if (currentActivity && !currentActivity.isPaused) {
        await activityService.pauseActivity(currentActivity.id);
        this.emit('activityAutoPaused', currentActivity);
      }
    } else if (idleTime < this.idleThreshold && this.isIdle) {
      // Resumed from idle
      this.isIdle = false;
      this.emit('resumed', { idleDuration: idleTime });
      
      // Show notification asking if user wants to resume
      this.showResumeNotification();
    }
    
    if (!this.isIdle) {
      this.lastActivity = new Date();
    }
  }

  private showResumeNotification(): void {
    const notification = new Notification({
      title: 'Welcome back!',
      body: 'You were away. Would you like to resume tracking?',
      actions: [
        { text: 'Resume', type: 'button' },
        { text: 'Stay Paused', type: 'button' }
      ]
    });

    notification.on('action', (event, index) => {
      if (index === 0) {
        // Resume tracking
        const activityService = ActivityService.getInstance();
        const currentActivity = activityService.getCurrentActivity();
        if (currentActivity?.isPaused) {
          activityService.resumeActivity(currentActivity.id);
        }
      }
    });

    notification.show();
  }

  private handleSystemSuspend(): void {
    this.emit('systemSuspend');
    // Auto-save and pause current activity
  }

  private handleSystemResume(): void {
    this.emit('systemResume');
    this.checkIdleStatus();
  }

  private handleScreenLock(): void {
    this.emit('screenLock');
    // Optionally pause activity on screen lock
  }

  private handleScreenUnlock(): void {
    this.emit('screenUnlock');
    this.showResumeNotification();
  }

  setIdleThreshold(minutes: number): void {
    this.idleThreshold = minutes * 60000;
  }

  getIdleThreshold(): number {
    return this.idleThreshold / 60000;
  }
}
```

### Analytics Service

```typescript
// src/main/services/AnalyticsService.ts
export class AnalyticsService {
  private static instance: AnalyticsService;
  private cacheRepository: AnalyticsCacheRepository;
  private activityRepository: ActivityRepository;

  static getInstance(): AnalyticsService {
    if (!AnalyticsService.instance) {
      AnalyticsService.instance = new AnalyticsService();
    }
    return AnalyticsService.instance;
  }

  constructor() {
    this.cacheRepository = new AnalyticsCacheRepository();
    this.activityRepository = new ActivityRepository();
  }

  async getDailyStats(date: Date): Promise<DailyStats> {
    const cacheKey = `daily_${format(date, 'yyyy-MM-dd')}`;
    
    // Check cache first
    const cached = await this.cacheRepository.get(cacheKey);
    if (cached && !this.isCacheExpired(cached)) {
      return cached.data;
    }

    // Calculate fresh stats
    const stats = await this.calculateDailyStats(date);
    
    // Cache results
    await this.cacheRepository.set(cacheKey, stats, 3600000); // 1 hour TTL
    
    return stats;
  }

  async getWeeklyStats(weekStart: Date): Promise<WeeklyStats> {
    const cacheKey = `weekly_${format(weekStart, 'yyyy-MM-dd')}`;
    
    const cached = await this.cacheRepository.get(cacheKey);
    if (cached && !this.isCacheExpired(cached)) {
      return cached.data;
    }

    const stats = await this.calculateWeeklyStats(weekStart);
    await this.cacheRepository.set(cacheKey, stats, 86400000); // 24 hour TTL
    
    return stats;
  }

  async getProductivityAnalysis(
    startDate: Date, 
    endDate: Date
  ): Promise<ProductivityAnalysis> {
    const activities = await this.activityRepository.findByDateRange(startDate, endDate);
    
    // Calculate productivity metrics
    const totalTime = activities.reduce((sum, a) => sum + (a.duration || 0), 0);
    const productiveTime = activities
      .filter(a => !a.tags?.includes('break') && !a.tags?.includes('meeting'))
      .reduce((sum, a) => sum + (a.duration || 0), 0);
    
    const productivityScore = totalTime > 0 ? (productiveTime / totalTime) * 100 : 0;
    
    // Time distribution by project
    const projectTime = new Map<string, number>();
    activities.forEach(activity => {
      const current = projectTime.get(activity.projectId) || 0;
      projectTime.set(activity.projectId, current + (activity.duration || 0));
    });
    
    // Peak productivity hours
    const hourlyDistribution = new Array(24).fill(0);
    activities.forEach(activity => {
      const hour = new Date(activity.startTime).getHours();
      hourlyDistribution[hour] += activity.duration || 0;
    });
    
    const peakHours = hourlyDistribution
      .map((duration, hour) => ({ hour, duration }))
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 3)
      .map(item => item.hour);
    
    // Distractions analysis
    const distractions = await this.analyzeDistractions(activities);
    
    return {
      totalTime,
      productiveTime,
      productivityScore,
      projectDistribution: Array.from(projectTime.entries()).map(([projectId, duration]) => ({
        projectId,
        duration,
        percentage: (duration / totalTime) * 100
      })),
      peakProductivityHours: peakHours,
      distractionPatterns: distractions,
      recommendations: this.generateRecommendations({
        productivityScore,
        peakHours,
        distractions
      })
    };
  }

  async updateDailyStats(activity: Activity): Promise<void> {
    const date = new Date(activity.startTime);
    date.setHours(0, 0, 0, 0);
    
    const cacheKey = `daily_${format(date, 'yyyy-MM-dd')}`;
    
    // Invalidate cache
    await this.cacheRepository.invalidate(cacheKey);
    
    // Recalculate if today
    if (isToday(date)) {
      await this.getDailyStats(date);
    }
  }

  private async calculateDailyStats(date: Date): Promise<DailyStats> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    const activities = await this.activityRepository.findByDateRange(startOfDay, endOfDay);
    
    const totalTime = activities.reduce((sum, a) => sum + (a.duration || 0), 0);
    const activeProjects = new Set(activities.map(a => a.projectId)).size;
    const completedActivities = activities.filter(a => a.endTime).length;
    const breakTime = activities
      .filter(a => a.tags?.includes('break'))
      .reduce((sum, a) => sum + (a.duration || 0), 0);
    
    // Hourly breakdown
    const hourlyBreakdown = new Array(24).fill(0);
    activities.forEach(activity => {
      const startHour = new Date(activity.startTime).getHours();
      const duration = activity.duration || 0;
      hourlyBreakdown[startHour] += duration;
    });
    
    return {
      date,
      totalTime,
      productiveTime: totalTime - breakTime,
      breakTime,
      activeProjects,
      completedActivities,
      averageActivityDuration: completedActivities > 0 ? totalTime / completedActivities : 0,
      hourlyBreakdown,
      topActivities: this.getTopActivities(activities, 5),
      goals: await this.getGoalProgress(date)
    };
  }

  private async analyzeDistractions(activities: Activity[]): Promise<DistractionPattern[]> {
    const patterns: DistractionPattern[] = [];
    
    // Context switching analysis
    let contextSwitches = 0;
    let lastProjectId = null;
    
    activities.forEach(activity => {
      if (lastProjectId && lastProjectId !== activity.projectId) {
        contextSwitches++;
      }
      lastProjectId = activity.projectId;
    });
    
    if (contextSwitches > activities.length * 0.3) {
      patterns.push({
        type: 'frequent_context_switching',
        severity: 'high',
        occurrences: contextSwitches,
        recommendation: 'Try to batch similar tasks together to reduce context switching'
      });
    }
    
    // Short activity analysis
    const shortActivities = activities.filter(a => 
      a.duration && a.duration < 300000 // Less than 5 minutes
    );
    
    if (shortActivities.length > activities.length * 0.4) {
      patterns.push({
        type: 'fragmented_work',
        severity: 'medium',
        occurrences: shortActivities.length,
        recommendation: 'Many short activities detected. Consider blocking time for focused work'
      });
    }
    
    return patterns;
  }

  private generateRecommendations(data: any): string[] {
    const recommendations: string[] = [];
    
    if (data.productivityScore < 50) {
      recommendations.push('Your productivity score is below 50%. Consider reducing meetings and distractions.');
    }
    
    if (data.peakHours.length > 0) {
      const peakHour = data.peakHours[0];
      recommendations.push(`You're most productive around ${peakHour}:00. Schedule important work during this time.`);
    }
    
    if (data.distractions.some(d => d.type === 'frequent_context_switching')) {
      recommendations.push('Reduce context switching by batching similar tasks together.');
    }
    
    return recommendations;
  }

  private isCacheExpired(cached: CacheEntry): boolean {
    return cached.expiresAt ? new Date() > new Date(cached.expiresAt) : false;
  }
}
```

## Integration APIs

### JIRA Integration

```typescript
// src/main/integrations/jira/JiraIntegration.ts
export class JiraIntegration {
  private apiClient: JiraApiClient;
  private syncService: SyncService;
  private isEnabled: boolean = false;

  constructor(config: JiraConfig) {
    this.apiClient = new JiraApiClient(config);
    this.syncService = new SyncService();
  }

  async enable(): Promise<void> {
    await this.apiClient.authenticate();
    this.isEnabled = true;
    
    // Initial sync
    await this.syncProjects();
    
    // Setup periodic sync
    setInterval(() => this.sync(), 300000); // Every 5 minutes
  }

  async syncProjects(): Promise<void> {
    try {
      const jiraProjects = await this.apiClient.getProjects();
      const projectService = ProjectService.getInstance();
      
      for (const jiraProject of jiraProjects) {
        const existingProject = await projectService.findByExternalId(
          'jira', 
          jiraProject.id
        );
        
        if (existingProject) {
          // Update existing
          await projectService.update(existingProject.id, {
            name: jiraProject.name,
            metadata: {
              ...existingProject.metadata,
              jira: {
                key: jiraProject.key,
                id: jiraProject.id,
                lastSync: new Date()
              }
            }
          });
        } else {
          // Create new
          await projectService.create({
            name: jiraProject.name,
            description: jiraProject.description,
            externalId: jiraProject.id,
            externalSource: 'jira',
            metadata: {
              jira: {
                key: jiraProject.key,
                id: jiraProject.id,
                lastSync: new Date()
              }
            }
          });
        }
      }
    } catch (error) {
      logger.error('JIRA sync failed:', error);
      throw error;
    }
  }

  async pushTimeEntry(activity: Activity): Promise<void> {
    if (!this.isEnabled) return;
    
    const project = await ProjectService.getInstance().findById(activity.projectId);
    
    if (!project?.metadata?.jira?.id) {
      return; // Not a JIRA project
    }
    
    try {
      const worklog = {
        issueId: project.metadata.jira.id,
        started: activity.startTime.toISOString(),
        timeSpentSeconds: Math.round((activity.duration || 0) / 1000),
        comment: activity.description || activity.name
      };
      
      await this.apiClient.addWorklog(worklog);
      
      // Mark as synced
      await ActivityService.getInstance().updateActivity(activity.id, {
        syncStatus: 'synced',
        metadata: {
          ...activity.metadata,
          jira: {
            worklogId: worklog.id,
            syncedAt: new Date()
          }
        }
      });
    } catch (error) {
      logger.error('Failed to push time entry to JIRA:', error);
      
      // Mark as failed
      await ActivityService.getInstance().updateActivity(activity.id, {
        syncStatus: 'failed',
        metadata: {
          ...activity.metadata,
          jira: {
            syncError: error.message,
            lastAttempt: new Date()
          }
        }
      });
    }
  }

  async sync(): Promise<void> {
    if (!this.isEnabled) return;
    
    // Sync projects
    await this.syncProjects();
    
    // Push pending time entries
    const pendingActivities = await ActivityService.getInstance()
      .getActivitiesBySyncStatus('pending');
    
    for (const activity of pendingActivities) {
      await this.pushTimeEntry(activity);
    }
  }
}
```

## Security & Authentication

### Encryption Service

```typescript
// src/main/services/security/EncryptionService.ts
export class EncryptionService {
  private static instance: EncryptionService;
  private key: Buffer;
  private algorithm = 'aes-256-gcm';

  static getInstance(): EncryptionService {
    if (!EncryptionService.instance) {
      EncryptionService.instance = new EncryptionService();
    }
    return EncryptionService.instance;
  }

  constructor() {
    this.key = this.deriveKey();
  }

  private deriveKey(): Buffer {
    // Use machine ID + user ID for key derivation
    const machineId = getMachineId();
    const userId = os.userInfo().username;
    const salt = `lighttrack_${machineId}_${userId}`;
    
    return crypto.pbkdf2Sync(salt, 'lighttrack_secret', 100000, 32, 'sha256');
  }

  encrypt(text: string): EncryptedData {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  }

  decrypt(data: EncryptedData): string {
    const decipher = crypto.createDecipheriv(
      this.algorithm, 
      this.key, 
      Buffer.from(data.iv, 'hex')
    );
    
    decipher.setAuthTag(Buffer.from(data.authTag, 'hex'));
    
    let decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  async encryptFile(inputPath: string, outputPath: string): Promise<void> {
    const input = fs.createReadStream(inputPath);
    const output = fs.createWriteStream(outputPath);
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
    
    // Write IV to beginning of file
    output.write(iv);
    
    input.pipe(cipher).pipe(output);
    
    return new Promise((resolve, reject) => {
      output.on('finish', resolve);
      output.on('error', reject);
    });
  }

  async decryptFile(inputPath: string, outputPath: string): Promise<void> {
    const input = fs.createReadStream(inputPath);
    const output = fs.createWriteStream(outputPath);
    
    // Read IV from beginning of file
    const iv = await this.readFirstBytes(inputPath, 16);
    
    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
    
    // Skip IV bytes
    input.read(16);
    
    input.pipe(decipher).pipe(output);
    
    return new Promise((resolve, reject) => {
      output.on('finish', resolve);
      output.on('error', reject);
    });
  }

  private readFirstBytes(path: string, bytes: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const stream = fs.createReadStream(path, { start: 0, end: bytes - 1 });
      const chunks: Buffer[] = [];
      
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }
}
```

### Permission Manager

```typescript
// src/main/services/security/PermissionManager.ts
export class PermissionManager {
  private static instance: PermissionManager;
  private permissions: Map<string, boolean> = new Map();

  static getInstance(): PermissionManager {
    if (!PermissionManager.instance) {
      PermissionManager.instance = new PermissionManager();
    }
    return PermissionManager.instance;
  }

  async requestPermissions(): Promise<void> {
    // System permissions
    if (process.platform === 'darwin') {
      await this.requestMacOSPermissions();
    } else if (process.platform === 'win32') {
      await this.requestWindowsPermissions();
    }
    
    // Application-specific permissions
    await this.requestNotificationPermission();
    await this.requestFileSystemPermission();
  }

  private async requestMacOSPermissions(): Promise<void> {
    const { systemPreferences } = require('electron');
    
    // Screen recording permission for window title capture
    const screenAccess = systemPreferences.getMediaAccessStatus('screen');
    if (screenAccess !== 'granted') {
      await systemPreferences.askForMediaAccess('screen');
    }
    
    // Accessibility permission for activity monitoring
    const accessibilityAccess = systemPreferences.isTrustedAccessibilityClient(true);
    this.permissions.set('accessibility', accessibilityAccess);
  }

  private async requestWindowsPermissions(): Promise<void> {
    // Windows-specific permissions
    // Most permissions are granted by default on Windows
    this.permissions.set('accessibility', true);
  }

  private async requestNotificationPermission(): Promise<void> {
    const { Notification } = require('electron');
    
    if (Notification.isSupported()) {
      this.permissions.set('notifications', true);
    }
  }

  private async requestFileSystemPermission(): Promise<void> {
    // Check if we can write to documents folder
    try {
      const testPath = path.join(app.getPath('documents'), 'LightTrack', '.test');
      await fs.promises.writeFile(testPath, 'test');
      await fs.promises.unlink(testPath);
      this.permissions.set('filesystem', true);
    } catch (error) {
      this.permissions.set('filesystem', false);
      logger.error('Filesystem permission denied:', error);
    }
  }

  hasPermission(permission: string): boolean {
    return this.permissions.get(permission) || false;
  }

  async checkAndRequestPermission(permission: string): Promise<boolean> {
    if (this.hasPermission(permission)) {
      return true;
    }
    
    // Re-request specific permission
    switch (permission) {
      case 'notifications':
        await this.requestNotificationPermission();
        break;
      case 'filesystem':
        await this.requestFileSystemPermission();
        break;
      // Add more cases as needed
    }
    
    return this.hasPermission(permission);
  }
}
```

## Performance & Optimization

### Database Optimization

```typescript
// src/main/database/DatabaseOptimizer.ts
export class DatabaseOptimizer {
  private db: Database;
  
  constructor(database: Database) {
    this.db = database;
  }

  async optimize(): Promise<void> {
    // Run VACUUM to reclaim space
    await this.db.exec('VACUUM;');
    
    // Analyze tables for query optimization
    await this.db.exec('ANALYZE;');
    
    // Create indexes if not exist
    await this.createIndexes();
    
    // Clean up old data
    await this.cleanupOldData();
  }

  private async createIndexes(): Promise<void> {
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_activities_date_project ON activities(start_time, project_id) WHERE is_deleted = 0;',
      'CREATE INDEX IF NOT EXISTS idx_activities_sync ON activities(sync_status, updated_at) WHERE is_deleted = 0;',
      'CREATE INDEX IF NOT EXISTS idx_projects_active ON projects(is_archived, name) WHERE is_deleted = 0;',
      'CREATE INDEX IF NOT EXISTS idx_analytics_cache_lookup ON analytics_cache(cache_key, expires_at);'
    ];
    
    for (const index of indexes) {
      await this.db.exec(index);
    }
  }

  private async cleanupOldData(): Promise<void> {
    // Remove deleted records older than 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    await this.db.run(
      'DELETE FROM activities WHERE is_deleted = 1 AND updated_at < ?',
      [thirtyDaysAgo.toISOString()]
    );
    
    // Clean expired cache
    await this.db.run(
      'DELETE FROM analytics_cache WHERE expires_at < ?',
      [new Date().toISOString()]
    );
  }

  async getStatistics(): Promise<DatabaseStats> {
    const stats = await this.db.all(`
      SELECT 
        'activities' as table_name,
        COUNT(*) as row_count,
        SUM(CASE WHEN is_deleted = 1 THEN 1 ELSE 0 END) as deleted_count
      FROM activities
      UNION ALL
      SELECT 
        'projects' as table_name,
        COUNT(*) as row_count,
        SUM(CASE WHEN is_deleted = 1 THEN 1 ELSE 0 END) as deleted_count
      FROM projects
    `);
    
    const dbSize = await this.getDatabaseSize();
    
    return {
      tables: stats,
      totalSize: dbSize,
      lastOptimized: new Date()
    };
  }

  private async getDatabaseSize(): Promise<number> {
    const dbPath = this.db.filename;
    const stats = await fs.promises.stat(dbPath);
    return stats.size;
  }
}
```

### Memory Cache

```typescript
// src/main/services/cache/MemoryCache.ts
export class MemoryCache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private maxSize: number;
  private ttl: number;
  
  constructor(options: CacheOptions = {}) {
    this.maxSize = options.maxSize || 1000;
    this.ttl = options.ttl || 3600000; // 1 hour default
    
    // Cleanup expired entries periodically
    setInterval(() => this.cleanup(), 60000); // Every minute
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return undefined;
    }
    
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return undefined;
    }
    
    // Update access time for LRU
    entry.lastAccess = Date.now();
    
    return entry.value;
  }

  set(key: string, value: T, ttl?: number): void {
    // Evict if at capacity
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }
    
    this.cache.set(key, {
      value,
      created: Date.now(),
      lastAccess: Date.now(),
      ttl: ttl || this.ttl
    });
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  private isExpired(entry: CacheEntry<T>): boolean {
    return Date.now() - entry.created > entry.ttl;
  }

  private evictLRU(): void {
    let lruKey: string | null = null;
    let lruTime = Date.now();
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccess < lruTime) {
        lruTime = entry.lastAccess;
        lruKey = key;
      }
    }
    
    if (lruKey) {
      this.cache.delete(lruKey);
    }
  }

  private cleanup(): void {
    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
      }
    }
  }

  getStats(): CacheStats {
    let expired = 0;
    
    for (const entry of this.cache.values()) {
      if (this.isExpired(entry)) {
        expired++;
      }
    }
    
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: 0, // Would need to track hits/misses
      expiredEntries: expired
    };
  }
}
```

## Error Handling & Logging

### Logger Configuration

```typescript
// src/main/services/logging/Logger.ts
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

export class Logger {
  private static instance: winston.Logger;

  static getInstance(): winston.Logger {
    if (!Logger.instance) {
      Logger.instance = Logger.createLogger();
    }
    return Logger.instance;
  }

  private static createLogger(): winston.Logger {
    const logDir = path.join(app.getPath('userData'), 'logs');
    
    // Ensure log directory exists
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const fileRotateTransport = new DailyRotateFile({
      filename: path.join(logDir, 'lighttrack-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    });

    const errorFileTransport = new DailyRotateFile({
      filename: path.join(logDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
      level: 'error',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    });

    const consoleTransport = new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    });

    return winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      transports: [
        fileRotateTransport,
        errorFileTransport,
        ...(process.env.NODE_ENV !== 'production' ? [consoleTransport] : [])
      ],
      exceptionHandlers: [
        new winston.transports.File({ 
          filename: path.join(logDir, 'exceptions.log') 
        })
      ],
      rejectionHandlers: [
        new winston.transports.File({ 
          filename: path.join(logDir, 'rejections.log') 
        })
      ]
    });
  }
}

export const logger = Logger.getInstance();
```

### Global Error Handler

```typescript
// src/main/services/error/ErrorHandler.ts
export class ErrorHandler {
  private static instance: ErrorHandler;
  private logger: winston.Logger;

  static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  constructor() {
    this.logger = Logger.getInstance();
    this.setupHandlers();
  }

  private setupHandlers(): void {
    // Handle uncaught exceptions
    process.on('uncaughtException', (error: Error) => {
      this.logger.error('Uncaught Exception:', error);
      
      // Show error dialog to user
      dialog.showErrorBox(
        'Unexpected Error',
        'An unexpected error occurred. The application will restart.'
      );
      
      // Restart app
      app.relaunch();
      app.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
      this.logger.error('Unhandled Rejection:', { reason, promise });
    });

    // Handle Electron errors
    app.on('render-process-gone', (event, webContents, details) => {
      this.logger.error('Renderer process gone:', details);
      
      if (details.reason === 'crashed') {
        // Reload the window
        webContents.reload();
      }
    });

    app.on('child-process-gone', (event, details) => {
      this.logger.error('Child process gone:', details);
    });
  }

  handleError(error: Error, context?: string): void {
    this.logger.error('Application Error:', {
      message: error.message,
      stack: error.stack,
      context,
      timestamp: new Date().toISOString()
    });

    // Categorize errors
    if (error.name === 'DatabaseError') {
      this.handleDatabaseError(error);
    } else if (error.name === 'NetworkError') {
      this.handleNetworkError(error);
    } else if (error.name === 'ValidationError') {
      this.handleValidationError(error);
    } else {
      this.handleGenericError(error);
    }
  }

  private handleDatabaseError(error: Error): void {
    // Attempt recovery
    DatabaseManager.getInstance().reconnect();
    
    // Notify user
    this.showNotification({
      type: 'error',
      title: 'Database Error',
      message: 'There was a problem accessing the database. Please try again.'
    });
  }

  private handleNetworkError(error: Error): void {
    // Queue for retry
    SyncService.getInstance().queueFailedOperation();
    
    // Notify user
    this.showNotification({
      type: 'warning',
      title: 'Connection Error',
      message: 'Unable to sync data. Will retry when connection is restored.'
    });
  }

  private handleValidationError(error: Error): void {
    // Log for debugging
    this.logger.warn('Validation Error:', error);
    
    // Show specific error to user
    this.showNotification({
      type: 'error',
      title: 'Invalid Input',
      message: error.message
    });
  }

  private handleGenericError(error: Error): void {
    // Log full error
    this.logger.error('Generic Error:', error);
    
    // Show generic message to user
    this.showNotification({
      type: 'error',
      title: 'Error',
      message: 'An error occurred. Please try again or contact support.'
    });
  }

  private showNotification(options: NotificationOptions): void {
    // Send to all renderer windows
    BrowserWindow.getAllWindows().forEach(window => {
      window.webContents.send('show-notification', options);
    });
  }
}
```

## Main Process Initialization

```typescript
// src/main/index.ts
import { app, BrowserWindow, ipcMain } from 'electron';
import { DatabaseManager } from './database/DatabaseManager';
import { IPCRegistry } from './ipc/IPCRegistry';
import { ActivityHandlers } from './ipc/handlers/ActivityHandlers';
import { ProjectHandlers } from './ipc/handlers/ProjectHandlers';
import { SettingsHandlers } from './ipc/handlers/SettingsHandlers';
import { ActivityService } from './services/ActivityService';
import { IdleDetectionService } from './services/IdleDetectionService';
import { AnalyticsService } from './services/AnalyticsService';
import { PermissionManager } from './services/security/PermissionManager';
import { ErrorHandler } from './services/error/ErrorHandler';
import { logger } from './services/logging/Logger';

class Application {
  private mainWindow: BrowserWindow | null = null;
  private ipcRegistry: IPCRegistry;
  private services: Map<string, any> = new Map();

  constructor() {
    this.ipcRegistry = new IPCRegistry();
    this.setupApplication();
  }

  private async setupApplication(): Promise<void> {
    // Initialize error handling first
    ErrorHandler.getInstance();
    
    logger.info('Starting LightTrack application...');

    // Single instance lock
    const gotTheLock = app.requestSingleInstanceLock();
    if (!gotTheLock) {
      app.quit();
      return;
    }

    // App events
    app.on('second-instance', () => {
      if (this.mainWindow) {
        if (this.mainWindow.isMinimized()) {
          this.mainWindow.restore();
        }
        this.mainWindow.focus();
      }
    });

    app.whenReady().then(() => this.initialize());
    app.on('window-all-closed', () => this.handleAllWindowsClosed());
    app.on('activate', () => this.handleActivate());
    app.on('before-quit', () => this.cleanup());
  }

  private async initialize(): Promise<void> {
    try {
      // Request permissions
      await PermissionManager.getInstance().requestPermissions();
      
      // Initialize database
      await DatabaseManager.getInstance().initialize();
      
      // Run migrations
      await DatabaseManager.getInstance().runMigrations();
      
      // Initialize services
      await this.initializeServices();
      
      // Register IPC handlers
      this.registerIPCHandlers();
      
      // Create main window
      await this.createMainWindow();
      
      // Start background services
      this.startBackgroundServices();
      
      logger.info('Application initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize application:', error);
      dialog.showErrorBox(
        'Initialization Error',
        'Failed to start LightTrack. Please check the logs.'
      );
      app.quit();
    }
  }

  private async initializeServices(): Promise<void> {
    // Core services
    this.services.set('activity', ActivityService.getInstance());
    this.services.set('project', ProjectService.getInstance());
    this.services.set('analytics', AnalyticsService.getInstance());
    this.services.set('settings', SettingsService.getInstance());
    
    // Background services
    this.services.set('idle', IdleDetectionService.getInstance());
    this.services.set('sync', SyncService.getInstance());
    
    logger.info('Services initialized');
  }

  private registerIPCHandlers(): void {
    const activityHandlers = new ActivityHandlers(this.services.get('activity'));
    const projectHandlers = new ProjectHandlers(this.services.get('project'));
    const settingsHandlers = new SettingsHandlers(this.services.get('settings'));
    
    this.ipcRegistry.register([
      ...activityHandlers.getHandlers(),
      ...projectHandlers.getHandlers(),
      ...settingsHandlers.getHandlers()
    ]);
    
    logger.info('IPC handlers registered');
  }

  private async createMainWindow(): Promise<void> {
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      },
      titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
      frame: process.platform !== 'darwin',
      backgroundColor: '#0f172a'
    });

    // Load the app
    if (process.env.NODE_ENV === 'development') {
      await this.mainWindow.loadURL('http://localhost:3000');
      this.mainWindow.webContents.openDevTools();
    } else {
      await this.mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    }

    // Window events
    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });
  }

  private startBackgroundServices(): void {
    // Start idle detection
    const idleService = this.services.get('idle');
    idleService.start();
    
    // Start sync service
    const syncService = this.services.get('sync');
    syncService.start();
    
    // Schedule analytics processing
    setInterval(() => {
      AnalyticsService.getInstance().processDaily();
    }, 3600000); // Every hour
    
    // Schedule database optimization
    setInterval(() => {
      DatabaseManager.getInstance().optimize();
    }, 86400000); // Daily
    
    logger.info('Background services started');
  }

  private handleAllWindowsClosed(): void {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  }

  private handleActivate(): void {
    if (BrowserWindow.getAllWindows().length === 0) {
      this.createMainWindow();
    }
  }

  private async cleanup(): Promise<void> {
    logger.info('Cleaning up before quit...');
    
    // Stop all services
    for (const [name, service] of this.services) {
      if (typeof service.dispose === 'function') {
        await service.dispose();
      }
    }
    
    // Close database
    await DatabaseManager.getInstance().close();
    
    // Unregister IPC handlers
    this.ipcRegistry.unregisterAll();
    
    logger.info('Cleanup complete');
  }
}

// Start the application
new Application();
```

## Preload Script

```typescript
// src/main/preload.ts
import { contextBridge, ipcRenderer } from 'electron';

// Whitelist of allowed channels
const ALLOWED_CHANNELS = {
  invoke: [
    'activity:start',
    'activity:stop',
    'activity:pause',
    'activity:resume',
    'activity:merge',
    'activity:split',
    'activity:export',
    'activity:bulkUpdate',
    'activity:bulkDelete',
    'activity:getTodayActivities',
    'activity:getFiltered',
    'activity:add',
    'activity:update',
    'activity:delete',
    'project:getAll',
    'project:create',
    'project:update',
    'project:delete',
    'settings:get',
    'settings:set',
    'analytics:getDailyStats',
    'analytics:getWeeklyStats',
    'analytics:getProductivityAnalysis'
  ],
  on: [
    'activity:started',
    'activity:stopped',
    'activity:updated',
    'activities:merged',
    'activity:split',
    'show-notification',
    'theme-changed',
    'sync-status-changed'
  ]
};

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  invoke: async (channel: string, ...args: any[]) => {
    if (ALLOWED_CHANNELS.invoke.includes(channel)) {
      try {
        const result = await ipcRenderer.invoke(channel, ...args);
        if (result.success === false) {
          throw new Error(result.error || 'Unknown error');
        }
        return result.data;
      } catch (error) {
        console.error(`IPC Error [${channel}]:`, error);
        throw error;
      }
    } else {
      throw new Error(`Channel ${channel} is not allowed`);
    }
  },
  
  on: (channel: string, callback: (...args: any[]) => void) => {
    if (ALLOWED_CHANNELS.on.includes(channel)) {
      const subscription = (_event: any, ...args: any[]) => callback(...args);
      ipcRenderer.on(channel, subscription);
      
      // Return a function to unsubscribe
      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    } else {
      throw new Error(`Channel ${channel} is not allowed`);
    }
  },
  
  // App info
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  getPlatform: () => process.platform,
  
  // File operations
  showSaveDialog: (options: any) => ipcRenderer.invoke('dialog:save', options),
  showOpenDialog: (options: any) => ipcRenderer.invoke('dialog:open', options),
  
  // System
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  showItemInFolder: (path: string) => ipcRenderer.invoke('shell:showItemInFolder', path)
});
```

## Conclusion

This backend solution design provides a comprehensive, production-ready architecture for LightTrack that:

1. **Properly connects frontend to backend** through a robust IPC layer
2. **Persists all data** with a well-structured SQLite database
3. **Handles all business logic** in organized service layers
4. **Provides real-time updates** through event-driven architecture
5. **Implements security** with encryption and permission management
6. **Optimizes performance** with caching and database indexing
7. **Handles errors gracefully** with comprehensive logging
8. **Supports integrations** with external services
9. **Enables background processing** for analytics and monitoring
10. **Maintains data integrity** through transactions and migrations

The architecture follows best practices for Electron applications, ensuring security through context isolation, proper IPC handling, and sandboxed renderer processes. The modular design allows for easy testing, maintenance, and future expansion.