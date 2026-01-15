# LightTrack Architecture Documentation

This document provides a comprehensive overview of LightTrack's v3.0.0 architecture, including system design, component interactions, data flow, and architectural decisions.

## Table of Contents

1. [System Overview](#system-overview)
2. [Process Architecture](#process-architecture)
3. [Component Architecture](#component-architecture)
4. [Data Architecture](#data-architecture)
5. [Service Architecture](#service-architecture)
6. [Error Handling Architecture](#error-handling-architecture)
7. [Performance Architecture](#performance-architecture)
8. [Security Architecture](#security-architecture)

## System Overview

LightTrack is built as a sophisticated Electron application with a multi-process architecture designed for performance, security, and maintainability.

```
┌─────────────────────────────────────────────────────────┐
│                    LightTrack v3.0.0                   │
│                    System Overview                      │
└─────────────────────────────────────────────────────────┘

┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Main Process  │    │ Renderer Process│    │  Browser Ext    │
│                 │    │                 │    │                 │
│ • Window Mgmt   │◄──►│ • UI Components │◄──►│ • Tab Tracking  │
│ • Activity Track│    │ • State Mgmt    │    │ • URL Detection │
│ • Data Storage  │    │ • Event Handling│    │ • Page Analysis │
│ • IPC Routing   │    │ • User Interface│    │                 │
│ • Service Layer │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   File System   │    │    UI Library   │    │   Web APIs      │
│                 │    │                 │    │                 │
│ • SQLite DB     │    │ • HTML/CSS/JS   │    │ • Chrome APIs   │
│ • Config Files  │    │ • Custom Comp.  │    │ • Firefox APIs  │
│ • Logs/Cache    │    │ • Frameworks    │    │ • Web Extensions│
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Key Architectural Principles

1. **Separation of Concerns**: Clear boundaries between UI, business logic, and data layers
2. **Security First**: Sandboxed processes with controlled IPC communication
3. **Performance Optimized**: Lazy loading, caching, and resource management
4. **Error Resilience**: Circuit breakers, fallbacks, and automatic recovery
5. **Extensibility**: Plugin architecture and well-defined APIs
6. **Testability**: Comprehensive test coverage with mocking capabilities

## Process Architecture

LightTrack uses Electron's multi-process architecture with enhanced security and performance optimizations.

### Main Process

```
┌─────────────────────────────────────────────────────────┐
│                     Main Process                        │
│                   (main.js + services)                  │
└─────────────────────────────────────────────────────────┘

┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  App Lifecycle  │    │  Window Manager │    │ Activity Tracker│
│                 │    │                 │    │                 │
│ • Startup       │    │ • Create Windows│    │ • Track Activity│
│ • Shutdown      │    │ • Window Events │    │ • Detect Apps   │
│ • Auto-updater  │    │ • Tray Management│    │ • Save Data     │
│ • Menu/Dock     │    │ • Modal System  │    │ • Idle Detection│
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   IPC Router    │    │  Storage Layer  │    │  Service Layer  │
│                 │    │                 │    │                 │
│ • Route Messages│    │ • Database Ops  │    │ • Error Boundary│
│ • Validate Data │    │ • File I/O      │    │ • Cleanup Mgmt  │
│ • Security Check│    │ • Compression   │    │ • Health Monitor│
│ • Rate Limiting │    │ • Backup/Restore│    │ • Recovery Sys  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Renderer Process

```
┌─────────────────────────────────────────────────────────┐
│                   Renderer Process                      │
│                (preload.js + UI layer)                  │
└─────────────────────────────────────────────────────────┘

┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│    Preload      │    │   UI Store      │    │   Components    │
│                 │    │                 │    │                 │
│ • IPC Bridge    │    │ • State Mgmt    │    │ • Sidebar       │
│ • API Exposure  │    │ • Subscriptions │    │ • Dashboard     │
│ • Security      │    │ • Actions       │    │ • Modal Manager │
│ • Context Bridge│    │ • Reducers      │    │ • Page Loader   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Event System  │    │   Page System   │    │   Theme System  │
│                 │    │                 │    │                 │
│ • Event Bus     │    │ • SPA Router    │    │ • CSS Variables │
│ • Listeners     │    │ • Page Cache    │    │ • Theme Toggle  │
│ • Custom Events │    │ • Lazy Loading  │    │ • Dark/Light    │
│ • Cleanup       │    │ • Transitions   │    │ • Accessibility │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### IPC Communication

```
Main Process                         Renderer Process
┌─────────────┐                     ┌─────────────┐
│             │   invoke/handle      │             │
│ IPC Handlers│◄────────────────────►│ lightTrackAPI│
│             │                     │             │
│ • Validation│   response/error     │ • Type Safe │
│ • Security  │◄────────────────────►│ • Promises  │
│ • Rate Limit│                     │ • Events    │
└─────────────┘                     └─────────────┘
       │                                   │
       ▼                                   ▼
┌─────────────┐                     ┌─────────────┐
│   Services  │                     │ UI Components│
│             │                     │             │
│ • Business  │                     │ • User      │
│   Logic     │                     │   Interface │
│ • Data Ops  │                     │ • Rendering │
└─────────────┘                     └─────────────┘
```

## Component Architecture

### Service Layer Components

```
┌─────────────────────────────────────────────────────────┐
│                    Service Layer                        │
└─────────────────────────────────────────────────────────┘

┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ WindowManager   │    │ ActivityTracker │    │  CleanupManager │
│                 │    │                 │    │                 │
│ • Window CRUD   │    │ • Auto Tracking │    │ • Resource Track│
│ • Event Mgmt    │    │ • Manual Entry  │    │ • Priority Queue│
│ • Memory Mgmt   │    │ • Data Storage  │    │ • Safe Cleanup  │
│ • Tray System   │    │ • Idle Detection│    │ • Error Handle  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ ErrorBoundary   │    │ ErrorRecovery   │    │ HealthMonitor   │
│                 │    │                 │    │                 │
│ • Circuit Break │    │ • Auto Recovery │    │ • Service Health│
│ • Retry Logic   │    │ • Strategy Mgmt │    │ • Performance   │
│ • Fallback      │    │ • Pattern Detect│    │ • Diagnostics   │
│ • Health Track  │    │ • Self Healing  │    │ • Alerting      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### UI Layer Components

```
┌─────────────────────────────────────────────────────────┐
│                      UI Layer                           │
└─────────────────────────────────────────────────────────┘

┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ UnifiedSidebar  │    │  ModalManager   │    │   PageLoader    │
│                 │    │                 │    │                 │
│ • Navigation    │    │ • Modal Stack   │    │ • SPA Routing   │
│ • State Sync    │    │ • Focus Mgmt    │    │ • Page Cache    │
│ • Responsive    │    │ • ARIA Support  │    │ • Lazy Loading  │
│ • Keyboard Nav  │    │ • Event Handle  │    │ • Transitions   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│    UIStore      │    │ UserFeedback    │    │  EventManager   │
│                 │    │                 │    │                 │
│ • Centralized   │    │ • Notifications │    │ • Event Bus     │
│ • Subscriptions │    │ • Progress      │    │ • Custom Events │
│ • Actions       │    │ • Error Display │    │ • Listener Mgmt │
│ • Persistence   │    │ • Success Toast │    │ • Memory Safety │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Component Lifecycle

```
Component Initialization
          │
          ▼
┌─────────────────┐
│   Constructor   │ ── Initialize state, bind methods
└─────────────────┘
          │
          ▼
┌─────────────────┐
│  Event Setup    │ ── Add event listeners, connect to store
└─────────────────┘
          │
          ▼
┌─────────────────┐
│     Render      │ ── Create DOM elements, apply styles
└─────────────────┘
          │
          ▼
┌─────────────────┐
│    Active       │ ── Handle user interactions, state updates
└─────────────────┘
          │
          ▼
┌─────────────────┐
│    Cleanup      │ ── Remove listeners, clear timers, free memory
└─────────────────┘
```

## Data Architecture

### Storage Layer

```
┌─────────────────────────────────────────────────────────┐
│                    Storage Layer                        │
└─────────────────────────────────────────────────────────┘

┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Activities    │    │    Settings     │    │     Cache       │
│                 │    │                 │    │                 │
│ • SQLite DB     │    │ • JSON Files    │    │ • Memory Cache  │
│ • Compressed    │    │ • Hierarchical  │    │ • Disk Cache    │
│ • Indexed       │    │ • Validated     │    │ • TTL Support   │
│ • Backed Up     │    │ • Encrypted     │    │ • LRU Eviction  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│     Backups     │    │      Logs       │    │   Temp Files    │
│                 │    │                 │    │                 │
│ • Auto Backup   │    │ • Rotating Logs │    │ • Export Files  │
│ • Compression   │    │ • Log Levels    │    │ • Import Staging│
│ • Retention     │    │ • Structured    │    │ • Cache Files   │
│ • Verification  │    │ • Error Logging │    │ • Auto Cleanup  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Data Flow

```
User Action
     │
     ▼
┌─────────────────┐    Validate    ┌─────────────────┐
│  UI Component   │ ──────────────► │  IPC Handler    │
└─────────────────┘                └─────────────────┘
     ▲                                       │
     │                                       ▼
┌─────────────────┐                ┌─────────────────┐
│  State Update   │                │   Service Call  │
└─────────────────┘                └─────────────────┘
     ▲                                       │
     │                                       ▼
┌─────────────────┐                ┌─────────────────┐
│   Event Bus     │◄───────────────│  Data Operation │
└─────────────────┘   Notify       └─────────────────┘
                                            │
                                            ▼
                                   ┌─────────────────┐
                                   │    Storage      │
                                   └─────────────────┘
```

### Data Models

#### Activity Data Model
```typescript
interface Activity {
  // Core identifiers
  id: string;
  startTime: string;    // ISO timestamp
  endTime?: string;     // ISO timestamp
  
  // Content
  title: string;
  app: string;
  project: string;
  
  // Time tracking
  duration: number;        // Total time in seconds
  actualDuration?: number; // Excluding idle time
  idlePeriods?: IdlePeriod[];
  
  // Classification
  tickets: string[];    // JIRA tickets, etc.
  tags: string[];      // Custom tags
  billable: boolean;
  
  // Business data
  sapCode?: string;
  costCenter?: string;
  poNumber?: string;
  wbsElement?: string;
  
  // Metadata
  metadata?: Record<string, any>;
  mergedCount?: number;     // If consolidated
  
  // Privacy
  doNotTrack: boolean;
  doNotTrackCategory?: string;
  doNotTrackReason?: string;
}
```

#### Settings Data Model
```typescript
interface Settings {
  ui: {
    theme: 'light' | 'dark' | 'auto';
    sidebarCollapsed: boolean;
    showFloatingTimer: boolean;
    floatingTimerOpacity: number;
  };
  tracking: {
    autoSave: boolean;
    autoSaveInterval: number;
    idleThreshold: number;
    pauseOnIdle: boolean;
    minActivityDuration: number;
  };
  data: {
    dataRetention: number;
    compression: boolean;
    autoBackup: boolean;
    backupInterval: number;
  };
  // ... additional setting groups
}
```

## Service Architecture

### Service Integration Bridge

```
┌─────────────────────────────────────────────────────────┐
│                 Service Bridge                          │
│              (Integration Layer)                        │
└─────────────────────────────────────────────────────────┘

Legacy Services          Feature Flags          New Services
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│   Old       │         │             │         │    New      │
│ WindowMgr   │◄────────│ Toggle Logic│────────►│ WindowMgr   │
│             │         │             │         │             │
│ • Basic     │         │ • A/B Test  │         │ • Enhanced  │
│ • Legacy    │         │ • Gradual   │         │ • Memory    │
│ • Stable    │         │ • Rollback  │         │ • Error     │
└─────────────┘         └─────────────┘         └─────────────┘
```

### Service Health Monitoring

```
┌─────────────────────────────────────────────────────────┐
│                Health Monitoring                        │
└─────────────────────────────────────────────────────────┘

┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Metrics   │    │ Diagnostics │    │   Alerts    │
│             │    │             │    │             │
│ • CPU Usage │    │ • Memory     │    │ • Threshold │
│ • Memory    │    │ • Disk I/O   │    │ • Events    │
│ • Response  │    │ • Network    │    │ • Recovery  │
│ • Error Rate│    │ • Services   │    │ • Notify    │
└─────────────┘    └─────────────┘    └─────────────┘
       │                   │                   │
       ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────────┐
│              Health Dashboard                           │
│                                                         │
│ Service Status: ●●●○○ (3/5 Healthy)                     │
│ Memory Usage:   ████████░░ 87% (OK)                     │
│ Error Rate:     ██░░░░░░░░ 15% (Warning)                │
│ Response Time:  ███████░░░ 145ms (OK)                   │
└─────────────────────────────────────────────────────────┘
```

## Error Handling Architecture

### Error Boundary System

```
┌─────────────────────────────────────────────────────────┐
│                Error Boundary System                    │
└─────────────────────────────────────────────────────────┘

Application Layer
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ Global Handler  │    │Service Boundary │    │Component Boundary│
│                 │    │                 │    │                 │
│ • Unhandled     │    │ • Service Calls │    │ • Render Errors │
│ • Promise Reject│    │ • Circuit Break │    │ • Event Errors  │
│ • Window Errors │    │ • Retry Logic   │    │ • State Errors  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────────────────────────────────────────────┐
│                Error Processing                         │
│                                                         │
│ 1. Capture & Classify                                   │
│ 2. Log & Report                                         │
│ 3. Recovery Strategy                                    │
│ 4. User Notification                                    │
│ 5. Fallback Behavior                                    │
└─────────────────────────────────────────────────────────┘
```

### Circuit Breaker Pattern

```
Service Call Flow with Circuit Breaker

Normal Operation (CLOSED)
┌─────────┐    Success    ┌─────────┐    Success    ┌─────────┐
│ Request │──────────────►│ Service │──────────────►│Response │
└─────────┘               └─────────┘               └─────────┘

Failure Threshold Reached (OPEN)
┌─────────┐    Failure    ┌─────────┐               ┌─────────┐
│ Request │──────────────►│Fallback │──────────────►│Response │
└─────────┘               └─────────┘               └─────────┘

Recovery Attempt (HALF-OPEN)
┌─────────┐   Test Call   ┌─────────┐   If Success  ┌─────────┐
│ Request │──────────────►│ Service │──────────────►│ CLOSED  │
└─────────┘               └─────────┘               └─────────┘
                              │
                              │ If Failure
                              ▼
                          ┌─────────┐
                          │  OPEN   │
                          └─────────┘
```

### Recovery Strategies

```
┌─────────────────────────────────────────────────────────┐
│                 Recovery Strategies                     │
└─────────────────────────────────────────────────────────┘

┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Auto Retry     │    │   Fallback      │    │  Rollback       │
│                 │    │                 │    │                 │
│ • Exponential   │    │ • Cached Data   │    │ • State Restore │
│ • Backoff       │    │ • Default Values│    │ • Data Recovery │
│ • Jitter        │    │ • Offline Mode  │    │ • Clean Restart │
│ • Max Attempts  │    │ • Reduced Func  │    │ • Backup Restore│
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────────────────────────────────────────────┐
│              Recovery Orchestration                     │
│                                                         │
│ 1. Detect Error Type                                    │
│ 2. Select Strategy                                      │
│ 3. Execute Recovery                                     │
│ 4. Verify Success                                       │
│ 5. Update Health Status                                 │
└─────────────────────────────────────────────────────────┘
```

## Performance Architecture

### Performance Monitoring

```
┌─────────────────────────────────────────────────────────┐
│               Performance Monitoring                    │
└─────────────────────────────────────────────────────────┘

┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Metrics       │    │   Profiling     │    │  Optimization   │
│                 │    │                 │    │                 │
│ • Response Time │    │ • CPU Profiling │    │ • Lazy Loading  │
│ • Memory Usage  │    │ • Memory Profil │    │ • Code Splitting│
│ • Disk I/O      │    │ • Render Profil │    │ • Caching       │
│ • Network       │    │ • Bundle Analys │    │ • Compression   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────────────────────────────────────────────┐
│            Performance Dashboard                        │
│                                                         │
│ Startup Time:    ████████░░ 1.2s (Target: <3s)         │
│ Memory Usage:    ██████░░░░ 85MB (Limit: 100MB)        │
│ Response Time:   ████████░░ 120ms (Target: <150ms)     │
│ Error Rate:      ██░░░░░░░░ 0.2% (Target: <1%)         │
└─────────────────────────────────────────────────────────┘
```

### Caching Strategy

```
┌─────────────────────────────────────────────────────────┐
│                  Caching Strategy                       │
└─────────────────────────────────────────────────────────┘

Memory Cache (L1)
┌─────────────────┐
│   Hot Data      │ ── Recently accessed data
│ • UI State      │ ── Component state
│ • Active Users  │ ── Current session data
│ • Freq. Queries │ ── Common database queries
└─────────────────┘
         │
         ▼
Disk Cache (L2)
┌─────────────────┐
│  Warm Data      │ ── Less frequently accessed
│ • Image Assets  │ ── UI resources
│ • Config Files  │ ── Settings and preferences
│ • Query Results │ ── Database query cache
└─────────────────┘
         │
         ▼
Compressed Storage (L3)
┌─────────────────┐
│   Cold Data     │ ── Rarely accessed data
│ • Old Activities│ ── Historical data
│ • Archived Logs │ ── Historical logs
│ • Backup Data   │ ── System backups
└─────────────────┘
```

## Security Architecture

### Security Layers

```
┌─────────────────────────────────────────────────────────┐
│                   Security Layers                       │
└─────────────────────────────────────────────────────────┘

Application Security
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Process Sand   │    │  IPC Security   │    │  Data Security  │
│                 │    │                 │    │                 │
│ • Sandboxed     │    │ • Input Valid   │    │ • Encryption    │
│ • No Node.js    │    │ • Rate Limiting │    │ • Access Control│
│ • Context Isol  │    │ • Channel Valid │    │ • Data Masking  │
│ • Preload Only  │    │ • Auth Required │    │ • Audit Logging │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────────────────────────────────────────────┐
│                System Security                          │
│                                                         │
│ • File System Permissions                               │
│ • Network Access Control                                │
│ • Memory Protection                                     │
│ • Code Signing Verification                             │
└─────────────────────────────────────────────────────────┘
```

### Data Protection

```
Data Flow Security

User Input
    │ ── Input Validation
    ▼
┌─────────────┐
│   Sanitize  │ ── Remove harmful content
└─────────────┘
    │ ── Type checking
    ▼
┌─────────────┐
│   Validate  │ ── Schema validation
└─────────────┘
    │ ── Rate limiting
    ▼
┌─────────────┐
│   Process   │ ── Business logic
└─────────────┘
    │ ── Access control
    ▼
┌─────────────┐
│    Store    │ ── Encrypted storage
└─────────────┘
```

---

**Architecture Documentation Version**: 3.0.0  
**Last Updated**: 2024-01-15  
**Coverage**: Complete system architecture  
**Diagrams**: ASCII art for universal compatibility