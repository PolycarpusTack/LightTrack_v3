# LightTrack Solution Design Document

## Overview

LightTrack is a VSCode-inspired time tracking application designed for developers and professionals. This document outlines the complete solution design for all functionalities based on the UI mockup.

## Architecture Overview

### Core Technologies

- **Frontend**: React/Vue.js with TypeScript
- **State Management**: Redux/Vuex or Zustand
- **Backend**: Node.js with Express/Fastify
- **Database**: PostgreSQL with Redis for caching
- **Desktop Framework**: Electron (for desktop app)
- **Browser Extension**: WebExtensions API

### Design Principles

- **Modular Architecture**: Separate concerns for tracking, analytics, and integrations
- **Real-time Updates**: WebSocket connections for live data
- **Offline-First**: Local storage with sync capabilities
- **Privacy-Focused**: Local data processing with optional cloud sync

## Core Data Models

### Activity

```typescript
interface Activity {
  id: string;
  name: string;
  description?: string;
  projectId: string;
  categoryId?: string;
  startTime: Date;
  endTime?: Date;
  duration?: number; // in milliseconds
  isPaused: boolean;
  pausedDuration: number;
  applicationName?: string;
  windowTitle?: string;
  isManualEntry: boolean;
  tags: string[];
  metadata: Record<string, any>;
}
```

### Project

```typescript
interface Project {
  id: string;
  name: string;
  description?: string;
  color: string;
  icon?: string;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
  totalTime: number;
  settings: ProjectSettings;
}
```

### TimeEntry

```typescript
interface TimeEntry {
  id: string;
  activityId: string;
  projectId: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  billable: boolean;
  invoiced: boolean;
  notes?: string;
}
```

## Feature Specifications

### 1. Dashboard Tab

#### Current Activity Widget

**Purpose**: Real-time display of active time tracking

**Components**:

- **Timer Display**: Shows elapsed time in HH:MM:SS format
- **Activity Info**: Current task name, project, and application
- **Control Buttons**: Start/Stop, Pause/Resume

**Technical Implementation**:

```typescript
class ActivityTracker {
  private currentActivity: Activity | null;
  private timerInterval: NodeJS.Timer | null;
  private listeners: Set<(activity: Activity) => void>;

  start(activityData: Partial<Activity>): void {
    this.currentActivity = {
      id: generateId(),
      startTime: new Date(),
      isPaused: false,
      pausedDuration: 0,
      isManualEntry: false,
      ...activityData,
    };

    this.startTimer();
    this.notifyListeners();
    this.persistToStorage();
  }

  pause(): void {
    if (this.currentActivity && !this.currentActivity.isPaused) {
      this.currentActivity.isPaused = true;
      this.currentActivity.pauseStartTime = new Date();
      this.stopTimer();
    }
  }

  resume(): void {
    if (this.currentActivity && this.currentActivity.isPaused) {
      const pauseDuration =
        Date.now() - this.currentActivity.pauseStartTime.getTime();
      this.currentActivity.pausedDuration += pauseDuration;
      this.currentActivity.isPaused = false;
      this.startTimer();
    }
  }
}
```

#### Quick Stats Cards

**Purpose**: At-a-glance productivity metrics

**Metrics**:

- **Today Total**: Sum of all tracked time today
- **Active Projects**: Count of unique projects worked on
- **Productivity Score**: Percentage of productive vs total time
- **Breaks Taken**: Number of pause sessions

**Data Sources**:

- Local IndexedDB for immediate access
- Background calculation service
- Real-time updates via event system

#### Today's Activities List

**Purpose**: Chronological list of completed activities

**Features**:

- Grouped by time blocks
- Expandable details
- Quick edit capabilities
- Bulk operations (delete, export, categorize)

**Implementation**:

```typescript
interface ActivityListController {
  async loadTodayActivities(): Promise<Activity[]> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    return await db.activities
      .where('startTime')
      .aboveOrEqual(startOfDay)
      .toArray();
  }

  async mergeActivities(activityIds: string[]): Promise<Activity> {
    // Merge logic for combining similar activities
  }

  async splitActivity(activityId: string, splitTime: Date): Promise<Activity[]> {
    // Split logic for dividing activities
  }
}
```

### 2. Timeline Tab

#### Visual Timeline Component

**Purpose**: Gantt-chart style visualization of time blocks

**Features**:

- **Zoom Levels**: Hour, Day, Week, Month views
- **Drag & Drop**: Adjust activity times visually
- **Color Coding**: By project/category
- **Gaps Detection**: Highlight untracked time

**Technical Design**:

```typescript
class TimelineRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private scale: TimeScale;
  private viewport: ViewportBounds;

  renderTimeline(activities: Activity[], timeRange: TimeRange): void {
    this.clearCanvas();
    this.drawTimeAxis();
    this.drawActivityBlocks(activities);
    this.drawCurrentTimeIndicator();
  }

  private calculateBlockPosition(activity: Activity): BlockPosition {
    const x = this.timeToPixel(activity.startTime);
    const width = this.durationToPixel(activity.duration);
    const y = this.getTrackPosition(activity.projectId);

    return { x, y, width, height: BLOCK_HEIGHT };
  }
}
```

#### Timeline Interactions

- **Hover Details**: Show activity info on hover
- **Click to Edit**: Open activity editor
- **Multi-select**: Shift+click for bulk operations
- **Context Menu**: Right-click options

### 3. Analytics Tab

#### Time by Project (Pie Chart)

**Purpose**: Visual breakdown of time allocation

**Data Processing**:

```typescript
interface ProjectTimeAnalytics {
  calculateProjectDistribution(timeRange: TimeRange): ProjectStats[] {
    return activities
      .groupBy('projectId')
      .map(group => ({
        projectId: group.key,
        totalTime: group.sum('duration'),
        percentage: (group.sum('duration') / totalTime) * 100,
        activityCount: group.count()
      }))
      .sortBy('totalTime', 'desc');
  }
}
```

#### Productivity Trend (Line Chart)

**Purpose**: Track productivity patterns over time

**Metrics**:

- **Daily Productive Hours**: Tracked time per day
- **Weekly Average**: Rolling 7-day average
- **Goal Progress**: Comparison to set targets
- **Peak Hours**: Most productive times

**Implementation**:

```typescript
class ProductivityAnalyzer {
  async calculateTrends(days: number): Promise<TrendData> {
    const activities = await this.getActivitiesForDays(days);

    return {
      daily: this.calculateDailyTotals(activities),
      hourly: this.calculateHourlyDistribution(activities),
      weekly: this.calculateWeeklyPatterns(activities),
      categories: this.calculateCategoryBreakdown(activities),
    };
  }

  detectPatterns(trendData: TrendData): InsightResult[] {
    const insights = [];

    // Peak productivity hours
    const peakHours = this.findPeakProductivityHours(trendData.hourly);

    // Consistency analysis
    const consistency = this.analyzeConsistency(trendData.daily);

    // Project focus analysis
    const projectFocus = this.analyzeProjectSwitching(trendData);

    return insights;
  }
}
```

### 4. Timer/Tracker Sidebar

#### Today View

**Purpose**: Focus on current day's activities

**Components**:

- **Active Timer**: If tracking, show current activity
- **Today's Summary**: Total time, breaks, productivity
- **Recent Activities**: Last 5-10 activities
- **Quick Actions**: Start common tasks

#### This Week View

**Purpose**: Weekly overview and planning

**Features**:

- **Week Calendar**: Visual grid of tracked time
- **Daily Totals**: Bar chart of daily hours
- **Week Goals**: Progress indicators
- **Comparison**: vs. previous week

#### Reports Section

**Purpose**: Detailed reporting capabilities

**Report Types**:

- **Daily Summary**: Automated end-of-day report
- **Weekly Report**: Comprehensive weekly analysis
- **Project Report**: Deep dive into specific projects
- **Custom Reports**: User-defined parameters

**Report Generator**:

```typescript
class ReportGenerator {
  async generateReport(
    type: ReportType,
    params: ReportParams
  ): Promise<Report> {
    const data = await this.fetchReportData(params);
    const analysis = await this.analyzeData(data);
    const insights = await this.generateInsights(analysis);

    return {
      metadata: this.createMetadata(type, params),
      summary: this.createSummary(data),
      details: this.formatDetails(data),
      charts: this.generateCharts(analysis),
      insights: insights,
      exportFormats: ["PDF", "CSV", "JSON"],
    };
  }
}
```

### 5. Projects Functionality

#### Project Management

**Purpose**: Organize and categorize work

**Features**:

- **Project Creation**: Name, color, icon, description
- **Project Hierarchy**: Parent/child relationships
- **Project Templates**: Reusable project structures
- **Bulk Import**: From JIRA, GitHub, etc.

**Data Structure**:

```typescript
interface ProjectManager {
  projects: Map<string, Project>;

  async createProject(data: ProjectInput): Promise<Project> {
    const project = {
      id: generateId(),
      name: data.name,
      color: data.color || generateColor(),
      createdAt: new Date(),
      totalTime: 0,
      isArchived: false,
      settings: {
        billable: data.billable || false,
        hourlyRate: data.hourlyRate,
        timeGoals: data.timeGoals,
        notifications: data.notifications
      }
    };

    await this.saveProject(project);
    await this.syncWithIntegrations(project);

    return project;
  }
}
```

#### Project Analytics

- **Time Tracking**: Total time per project
- **Activity Heatmap**: When work happens
- **Team Collaboration**: If multi-user
- **Budget Tracking**: For billable projects

### 6. Goals Functionality

#### Goal Types

**Purpose**: Drive productivity through targets

**Goal Categories**:

- **Daily Goals**: Hours per day targets
- **Weekly Goals**: Weekly hour commitments
- **Project Goals**: Time allocation per project
- **Habit Goals**: Consistency targets

**Goal Engine**:

```typescript
class GoalTracker {
  private goals: Goal[];
  private achievements: Achievement[];

  async checkGoalProgress(): Promise<GoalProgress[]> {
    return this.goals.map((goal) => {
      const progress = this.calculateProgress(goal);
      const status = this.determineStatus(progress, goal);

      return {
        goalId: goal.id,
        current: progress.current,
        target: goal.target,
        percentage: (progress.current / goal.target) * 100,
        status,
        projectedCompletion: this.projectCompletion(goal, progress),
      };
    });
  }

  async createNotifications(progress: GoalProgress[]): Promise<Notification[]> {
    const notifications = [];

    progress.forEach((p) => {
      if (p.percentage >= 100 && !p.notified) {
        notifications.push(this.createAchievementNotification(p));
      } else if (p.percentage < 50 && this.isDeadlineNear(p)) {
        notifications.push(this.createReminderNotification(p));
      }
    });

    return notifications;
  }
}
```

#### Goal Visualization

- **Progress Bars**: Visual indicators
- **Streak Tracking**: Consecutive days meeting goals
- **Achievement Badges**: Gamification elements
- **Insights**: AI-powered suggestions

### 7. Settings Functionality

#### Profile Settings

**Purpose**: User customization and preferences

**Options**:

- **User Information**: Name, avatar, timezone
- **Work Schedule**: Working hours, break preferences
- **Privacy Settings**: Data sharing, analytics opt-out
- **Export/Import**: Backup and restore data

#### Notification Settings

```typescript
interface NotificationSettings {
  reminders: {
    enabled: boolean;
    idleTime: number; // minutes before reminder
    frequency: "once" | "repeat";
    quietHours: TimeRange;
  };

  goals: {
    dailyProgress: boolean;
    weeklyReport: boolean;
    achievements: boolean;
  };

  integrations: {
    slack: SlackNotificationConfig;
    email: EmailNotificationConfig;
    desktop: DesktopNotificationConfig;
  };
}
```

#### Appearance Settings

- **Theme Selection**: Dark, Light, Auto
- **Color Schemes**: Customizable accent colors
- **Font Size**: Accessibility options
- **Layout Density**: Compact, Normal, Spacious

#### Keyboard Shortcuts

**Customizable Shortcuts**:

```typescript
const defaultShortcuts: ShortcutMap = {
  startStop: "Ctrl+Shift+Space",
  pause: "Ctrl+Shift+P",
  quickEntry: "Ctrl+Shift+N",
  openDashboard: "Ctrl+1",
  openTimeline: "Ctrl+2",
  openAnalytics: "Ctrl+3",
  commandPalette: "Ctrl+Shift+P",
  search: "Ctrl+K",
};
```

### 8. Integration Architecture

#### JIRA Integration

**Purpose**: Sync with JIRA issues and time tracking

**Features**:

- **Issue Import**: Pull JIRA issues as projects
- **Time Sync**: Push tracked time to JIRA
- **Status Updates**: Reflect JIRA status changes
- **Worklog Integration**: Bidirectional sync

**Implementation**:

```typescript
class JiraIntegration implements Integration {
  private apiClient: JiraApiClient;
  private syncQueue: SyncQueue;

  async syncIssues(): Promise<SyncResult> {
    const issues = await this.apiClient.getAssignedIssues();
    const projects = issues.map(this.issueToProject);

    await this.projectManager.importProjects(projects);

    return {
      imported: projects.length,
      updated: 0,
      errors: [],
    };
  }

  async pushTimeEntry(entry: TimeEntry): Promise<void> {
    const worklog = {
      issueId: entry.projectId,
      timeSpentSeconds: Math.floor(entry.duration / 1000),
      started: entry.startTime.toISOString(),
      comment: entry.notes || "Tracked with LightTrack",
    };

    await this.apiClient.addWorklog(worklog);
  }
}
```

#### GitHub Integration

- **Repository Tracking**: Auto-detect active repo
- **Commit Association**: Link time to commits
- **PR Time Tracking**: Track review time
- **Issue Integration**: Similar to JIRA

#### Calendar Sync

- **Google Calendar**: Import meetings as activities
- **Outlook Integration**: Corporate calendar sync
- **iCal Support**: Generic calendar protocol
- **Conflict Detection**: Warn about overlaps

## Background Services

### Activity Monitor Service

**Purpose**: Detect and track computer activity

```typescript
class ActivityMonitor {
  private activityDetector: ActivityDetector;
  private idleThreshold: number = 300000; // 5 minutes

  async startMonitoring(): Promise<void> {
    this.activityDetector.on("activity", this.handleActivity);
    this.activityDetector.on("idle", this.handleIdle);
    this.activityDetector.on("resume", this.handleResume);
  }

  private handleActivity = async (data: ActivityData): Promise<void> => {
    if (this.shouldTrack(data)) {
      await this.tracker.updateActivity({
        applicationName: data.appName,
        windowTitle: data.windowTitle,
        keystrokes: data.keystrokes,
        mouseActivity: data.mouseActivity,
      });
    }
  };
}
```

### Sync Service

**Purpose**: Handle data synchronization

**Features**:

- **Conflict Resolution**: Smart merge strategies
- **Offline Queue**: Store changes when offline
- **Incremental Sync**: Only sync changes
- **Compression**: Minimize bandwidth usage

### Analytics Engine

**Purpose**: Process and analyze time data

```typescript
class AnalyticsEngine {
  async processDaily(): Promise<void> {
    const yesterday = getYesterday();
    const activities = await this.getActivitiesForDate(yesterday);

    const analysis = {
      totalTime: this.calculateTotalTime(activities),
      productiveTime: this.calculateProductiveTime(activities),
      categories: this.categorizeActivities(activities),
      patterns: this.detectPatterns(activities),
      anomalies: this.detectAnomalies(activities),
    };

    await this.saveAnalysis(yesterday, analysis);
    await this.generateInsights(analysis);
  }
}
```

## Data Storage Architecture

### Local Storage

- **IndexedDB**: Primary data store
- **LocalStorage**: Settings and preferences
- **Session Storage**: Temporary UI state

### Cloud Storage (Optional)

- **PostgreSQL**: Main database
- **Redis**: Caching and real-time data
- **S3/Blob Storage**: Report archives

### Data Schema

```sql
-- Activities table
CREATE TABLE activities (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  project_id UUID,
  name VARCHAR(255) NOT NULL,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP,
  duration INTEGER,
  is_manual BOOLEAN DEFAULT FALSE,
  application_name VARCHAR(255),
  window_title TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Projects table
CREATE TABLE projects (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  color VARCHAR(7),
  parent_id UUID REFERENCES projects(id),
  is_archived BOOLEAN DEFAULT FALSE,
  settings JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Goals table
CREATE TABLE goals (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  type VARCHAR(50) NOT NULL,
  target JSONB NOT NULL,
  period VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Security & Privacy

### Data Protection

- **Encryption**: AES-256 for sensitive data
- **Local First**: Data stays on device by default
- **Opt-in Sync**: User controls cloud sync
- **Data Export**: Full data portability

### Authentication

```typescript
interface AuthenticationService {
  authenticate(credentials: Credentials): Promise<AuthToken>;
  refreshToken(token: AuthToken): Promise<AuthToken>;
  logout(): Promise<void>;

  // OAuth providers
  authenticateWithGoogle(): Promise<AuthToken>;
  authenticateWithGitHub(): Promise<AuthToken>;
}
```

## Performance Optimizations

### Frontend Optimizations

- **Virtual Scrolling**: For long activity lists
- **Memoization**: Cache expensive calculations
- **Web Workers**: Background data processing
- **Lazy Loading**: Load features on demand

### Backend Optimizations

- **Query Optimization**: Indexed searches
- **Batch Processing**: Group similar operations
- **Caching Strategy**: Multi-layer caching
- **Connection Pooling**: Efficient DB connections

## Deployment Architecture

### Desktop Application

- **Electron**: Cross-platform desktop app
- **Auto-updates**: Seamless updates
- **Native Integrations**: OS-level features
- **Tray Application**: Always accessible

### Web Application

- **PWA**: Progressive Web App
- **Service Workers**: Offline functionality
- **CDN**: Global content delivery
- **WebSockets**: Real-time updates

### Browser Extension

- **Manifest V3**: Modern extension API
- **Content Scripts**: Page monitoring
- **Background Service**: Persistent tracking
- **Cross-browser**: Chrome, Firefox, Edge

## API Design

### RESTful API

```typescript
// Activity endpoints
GET    /api/activities
POST   /api/activities
PUT    /api/activities/:id
DELETE /api/activities/:id

// Project endpoints
GET    /api/projects
POST   /api/projects
PUT    /api/projects/:id
DELETE /api/projects/:id

// Analytics endpoints
GET    /api/analytics/summary
GET    /api/analytics/trends
GET    /api/analytics/insights

// Integration endpoints
POST   /api/integrations/jira/sync
POST   /api/integrations/github/sync
GET    /api/integrations/status
```

### WebSocket Events

```typescript
// Real-time events
socket.on("activity:started", (activity: Activity) => {});
socket.on("activity:stopped", (activity: Activity) => {});
socket.on("activity:updated", (activity: Activity) => {});
socket.on("goal:achieved", (goal: Goal) => {});
socket.on("sync:completed", (result: SyncResult) => {});
```

## Testing Strategy

### Unit Tests

- **Component Testing**: React Testing Library
- **Service Testing**: Jest with mocks
- **Integration Testing**: API endpoint tests
- **Performance Testing**: Load testing

### E2E Tests

- **User Flows**: Cypress/Playwright
- **Cross-browser**: Multiple browser testing
- **Mobile Testing**: Responsive design tests
- **Accessibility**: WCAG compliance

## Monitoring & Analytics

### Application Monitoring

- **Error Tracking**: Sentry integration
- **Performance Monitoring**: Web Vitals
- **User Analytics**: Privacy-focused analytics
- **Feature Usage**: Track feature adoption

### Health Checks

```typescript
interface HealthCheck {
  database: boolean;
  redis: boolean;
  integrations: Record<string, boolean>;
  syncStatus: SyncStatus;
  lastBackup: Date;
}
```

## Future Enhancements

### AI-Powered Features

- **Smart Categorization**: Auto-categorize activities
- **Productivity Insights**: ML-based recommendations
- **Anomaly Detection**: Unusual pattern alerts
- **Natural Language**: Voice commands

### Team Features

- **Team Dashboard**: Aggregate team metrics
- **Project Collaboration**: Shared projects
- **Time Approval**: Manager approvals
- **Team Goals**: Collective targets

### Advanced Analytics

- **Predictive Analytics**: Forecast productivity
- **Custom Dashboards**: Drag-drop widgets
- **Data Export API**: Third-party integrations
- **Benchmarking**: Industry comparisons

## Conclusion

LightTrack's architecture is designed to be modular, scalable, and privacy-focused while providing powerful time tracking and analytics capabilities. The VSCode-inspired interface ensures familiarity for developers while the comprehensive feature set serves broader professional needs.
