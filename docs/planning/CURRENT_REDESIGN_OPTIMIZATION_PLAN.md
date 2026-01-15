# LightTrack Current Redesign Optimization Plan

## 🎯 Mission: Optimize Resource Usage & Add Power-User Features

This plan addresses your two main concerns without requiring major architectural changes to the current redesign:
1. **Reduce memory usage** and prevent "memory hog" behavior
2. **Add missing power-user features** for efficiency

---

## 📊 Current Resource Usage Analysis

### Memory Usage Issues Identified:
- **Timer updates**: 100ms intervals causing excessive renders
- **Data loading**: Loading ALL activities into memory at once
- **Chart.js**: Heavy library loaded even when not viewing analytics
- **Missing cleanup**: useEffect hooks not properly cleaning up
- **State duplication**: Same data stored in multiple Redux slices

### Target Improvements:
- 🎯 **50% memory reduction** (200-300MB → 100-150MB)
- 🎯 **3x faster startup** (8-12s → 2-4s)
- 🎯 **90% less CPU usage** during idle periods

---

## 🚀 Phase 1: Memory Optimization (Week 1)

### 1.1 Fix Timer Performance Issues

**Problem**: CurrentActivity timer updates every 100ms
```typescript
// Current (BAD): High frequency updates
const intervalRef = useRef<NodeJS.Timeout | null>(null);
setInterval(updateTimer, 100); // 10 updates per second!
```

**Solution**: Reduce frequency + smart display
```typescript
// Fixed: 1-second updates with smooth display
const [lastUpdate, setLastUpdate] = useState(Date.now());

useEffect(() => {
  const interval = setInterval(() => {
    setLastUpdate(Date.now());
  }, 1000); // 1 update per second
  
  return () => clearInterval(interval);
}, []);

// Display: Calculate elapsed time on render (no state updates)
const displayTime = useMemo(() => {
  if (!currentActivity) return '00:00:00';
  const elapsed = lastUpdate - new Date(currentActivity.startTime).getTime();
  return formatDuration(elapsed);
}, [currentActivity, lastUpdate]);
```

### 1.2 Implement Lazy Loading for Heavy Components

**Problem**: Chart.js and analytics load on app startup
```typescript
// Current (BAD): Heavy imports on startup
import { Chart as ChartJS, ... } from 'chart.js';
import { Line, Bar, Pie } from 'react-chartjs-2';
```

**Solution**: Lazy load analytics components
```typescript
// Analytics/index.tsx
const LazyAnalyticsPage = React.lazy(() => 
  import('./AnalyticsPage').then(module => {
    // Only import Chart.js when analytics is actually opened
    return import('chart.js').then(() => ({ default: module.AnalyticsPage }));
  })
);

export const AnalyticsPageWrapper: React.FC = () => (
  <Suspense fallback={<AnalyticsLoadingSkeleton />}>
    <LazyAnalyticsPage />
  </Suspense>
);
```

### 1.3 Implement Activity Pagination

**Problem**: Loading thousands of activities into memory
```typescript
// Current (BAD): Load everything
interface ActivityState {
  allActivities: Activity[]; // Could be thousands of items
}
```

**Solution**: Paginated loading with virtual scrolling
```typescript
// Enhanced activity slice
interface ActivityState {
  todayActivities: Activity[];
  recentActivities: Activity[]; // Last 50 only
  activityPages: Record<string, Activity[]>; // Paginated cache
  totalCount: number;
  currentPage: number;
}

// Activity list component with virtual scrolling
const ActivityList: React.FC = () => {
  const { data, hasNextPage, fetchNextPage } = useInfiniteQuery(
    'activities',
    ({ pageParam = 0 }) => fetchActivitiesPage(pageParam, 50),
    {
      getNextPageParam: (lastPage, pages) => 
        lastPage.length === 50 ? pages.length : undefined,
    }
  );
  
  return (
    <VirtualizedList
      data={data?.pages.flat() || []}
      onEndReached={fetchNextPage}
      hasNextPage={hasNextPage}
    />
  );
};
```

### 1.4 Fix Memory Leaks in Services

**Problem**: Event listeners not properly cleaned up
```typescript
// Current (BAD): IdleDetectionService
powerMonitor.on('suspend', this.handleSystemSuspend);
powerMonitor.on('resume', this.handleSystemResume);
// No cleanup when service is destroyed
```

**Solution**: Proper cleanup management
```typescript
// Enhanced IdleDetectionService
export class IdleDetectionService extends EventEmitter {
  private listeners: Array<() => void> = [];
  
  start(): void {
    const suspendHandler = this.handleSystemSuspend.bind(this);
    const resumeHandler = this.handleSystemResume.bind(this);
    
    powerMonitor.on('suspend', suspendHandler);
    powerMonitor.on('resume', resumeHandler);
    
    // Store cleanup functions
    this.listeners.push(
      () => powerMonitor.off('suspend', suspendHandler),
      () => powerMonitor.off('resume', resumeHandler)
    );
  }
  
  destroy(): void {
    // Clean up all listeners
    this.listeners.forEach(cleanup => cleanup());
    this.listeners = [];
    this.removeAllListeners();
  }
}
```

---

## ⚡ Phase 2: Power-User Features (Week 2)

### 2.1 Global Keyboard Shortcuts

**Add system-wide shortcuts that work even when app is minimized**

```typescript
// src/main/services/GlobalShortcutService.ts
export class GlobalShortcutService {
  private shortcuts: Map<string, string> = new Map();
  
  async initialize(): Promise<void> {
    const shortcuts = {
      'CommandOrControl+Shift+Space': 'toggle-tracking',
      'CommandOrControl+Shift+T': 'show-app',
      'CommandOrControl+Shift+Q': 'quick-start',
      'CommandOrControl+Shift+P': 'pause-tracking',
      'CommandOrControl+Shift+S': 'stop-tracking'
    };
    
    Object.entries(shortcuts).forEach(([key, action]) => {
      const success = globalShortcut.register(key, () => {
        this.handleShortcut(action);
      });
      
      if (success) {
        this.shortcuts.set(key, action);
        serviceLogger.info(`Registered global shortcut: ${key} -> ${action}`);
      }
    });
  }
  
  private async handleShortcut(action: string): Promise<void> {
    const activityService = ActivityService.getInstance();
    const mainWindow = WindowManager.getInstance().getMainWindow();
    
    switch (action) {
      case 'toggle-tracking':
        const current = await activityService.getCurrentActivity();
        if (current) {
          await activityService.stopActivity(current.id);
        } else {
          // Show quick start dialog
          mainWindow?.show();
          mainWindow?.webContents.send('show-quick-start');
        }
        break;
        
      case 'show-app':
        if (mainWindow?.isMinimized()) {
          mainWindow.restore();
        }
        mainWindow?.show();
        mainWindow?.focus();
        break;
        
      case 'quick-start':
        mainWindow?.webContents.send('show-quick-start');
        break;
        
      case 'pause-tracking':
        const currentActivity = await activityService.getCurrentActivity();
        if (currentActivity && !currentActivity.isPaused) {
          await activityService.pauseActivity(currentActivity.id);
        }
        break;
    }
  }
}
```

### 2.2 Enhanced Floating Timer

**Always-on-top mini timer with controls**

```typescript
// src/main/windows/FloatingTimerWindow.ts
export class FloatingTimerWindow {
  private window: BrowserWindow | null = null;
  private settings: FloatingTimerSettings;
  
  async create(settings: FloatingTimerSettings): Promise<void> {
    this.settings = settings;
    
    this.window = new BrowserWindow({
      width: settings.size === 'mini' ? 150 : 250,
      height: settings.size === 'mini' ? 60 : 100,
      frame: false,
      alwaysOnTop: settings.alwaysOnTop,
      skipTaskbar: true,
      resizable: false,
      transparent: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'floating-timer-preload.js')
      }
    });
    
    // Make click-through if enabled
    if (settings.clickThrough) {
      this.window.setIgnoreMouseEvents(true, { forward: true });
    }
    
    // Load floating timer UI
    await this.window.loadFile('floating-timer.html');
    
    // Position from settings
    this.positionWindow();
    
    // Auto-hide when not needed
    if (settings.autoHide) {
      this.setupAutoHide();
    }
  }
  
  private positionWindow(): void {
    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    
    let x, y;
    switch (this.settings.position) {
      case 'top-right':
        x = width - this.window!.getBounds().width - 20;
        y = 20;
        break;
      case 'top-left':
        x = 20;
        y = 20;
        break;
      case 'bottom-right':
        x = width - this.window!.getBounds().width - 20;
        y = height - this.window!.getBounds().height - 20;
        break;
      case 'bottom-left':
        x = 20;
        y = height - this.window!.getBounds().height - 20;
        break;
    }
    
    this.window!.setPosition(x, y);
  }
}
```

### 2.3 Quick Activity Switcher

**Fast switching between recent activities**

```typescript
// src/renderer/components/QuickActivitySwitcher.tsx
const QuickActivitySwitcher: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [recentActivities, setRecentActivities] = useState<Activity[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  // Listen for global shortcut
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key === 'Q') {
        event.preventDefault();
        setIsOpen(true);
        loadRecentActivities();
      }
      
      if (isOpen) {
        if (event.key === 'ArrowDown') {
          setSelectedIndex(i => Math.min(i + 1, recentActivities.length - 1));
        } else if (event.key === 'ArrowUp') {
          setSelectedIndex(i => Math.max(i - 1, 0));
        } else if (event.key === 'Enter') {
          const activity = recentActivities[selectedIndex];
          if (activity) {
            startSimilarActivity(activity);
            setIsOpen(false);
          }
        } else if (event.key === 'Escape') {
          setIsOpen(false);
        }
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, recentActivities, selectedIndex]);
  
  const loadRecentActivities = async () => {
    // Load last 10 unique activities (by name/project)
    const activities = await window.electronAPI.activity.getRecent(10);
    setRecentActivities(activities);
    setSelectedIndex(0);
  };
  
  if (!isOpen) return null;
  
  return (
    <div className={styles.overlay}>
      <div className={styles.switcher}>
        <div className={styles.header}>
          <span>Quick Switch Activity</span>
          <span className={styles.shortcut}>Ctrl+Shift+Q</span>
        </div>
        
        <div className={styles.activityList}>
          {recentActivities.map((activity, index) => (
            <div
              key={activity.id}
              className={`${styles.activityItem} ${
                index === selectedIndex ? styles.selected : ''
              }`}
              onClick={() => {
                startSimilarActivity(activity);
                setIsOpen(false);
              }}
            >
              <div className={styles.activityName}>{activity.name}</div>
              <div className={styles.projectName}>{activity.projectName}</div>
              <div className={styles.lastUsed}>
                {formatRelativeTime(activity.endTime)}
              </div>
            </div>
          ))}
        </div>
        
        <div className={styles.footer}>
          <span>↑↓ Navigate • Enter Select • Esc Cancel</span>
        </div>
      </div>
    </div>
  );
};
```

### 2.4 Inline Activity Editing

**Edit activity names and times directly in lists**

```typescript
// src/renderer/components/InlineEditableField.tsx
const InlineEditableField: React.FC<{
  value: string;
  onSave: (value: string) => Promise<void>;
  type?: 'text' | 'duration';
}> = ({ value, onSave, type = 'text' }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [isSaving, setIsSaving] = useState(false);
  
  const handleSave = async () => {
    if (editValue !== value) {
      setIsSaving(true);
      try {
        await onSave(editValue);
      } catch (error) {
        // Revert on error
        setEditValue(value);
      }
      setIsSaving(false);
    }
    setIsEditing(false);
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setEditValue(value);
      setIsEditing(false);
    }
  };
  
  if (isEditing) {
    return (
      <input
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className={styles.inlineEdit}
        autoFocus
        disabled={isSaving}
      />
    );
  }
  
  return (
    <span
      className={styles.editableField}
      onClick={() => setIsEditing(true)}
      title="Click to edit"
    >
      {value}
    </span>
  );
};

// Usage in activity list
<InlineEditableField
  value={activity.name}
  onSave={(newName) => updateActivity(activity.id, { name: newName })}
/>
```

### 2.5 Quick Time Adjustment

**+/- buttons for rapid time editing**

```typescript
// src/renderer/components/QuickTimeAdjuster.tsx
const QuickTimeAdjuster: React.FC<{
  activityId: string;
  currentDuration: number;
}> = ({ activityId, currentDuration }) => {
  const adjustTime = async (minutes: number) => {
    const newDuration = Math.max(0, currentDuration + (minutes * 60 * 1000));
    await window.electronAPI.activity.updateDuration(activityId, newDuration);
  };
  
  return (
    <div className={styles.timeAdjuster}>
      <button 
        onClick={() => adjustTime(-15)}
        className={styles.adjustBtn}
        title="Subtract 15 minutes"
      >
        -15m
      </button>
      <button 
        onClick={() => adjustTime(-5)}
        className={styles.adjustBtn}
        title="Subtract 5 minutes"
      >
        -5m
      </button>
      <span className={styles.duration}>
        {formatDuration(currentDuration)}
      </span>
      <button 
        onClick={() => adjustTime(5)}
        className={styles.adjustBtn}
        title="Add 5 minutes"
      >
        +5m
      </button>
      <button 
        onClick={() => adjustTime(15)}
        className={styles.adjustBtn}
        title="Add 15 minutes"
      >
        +15m
      </button>
    </div>
  );
};
```

---

## 📊 Expected Performance Improvements

### Memory Usage Reduction:
| Component | Before | After | Improvement |
|-----------|--------|-------|-------------|
| **Timer Updates** | 100ms intervals | 1s intervals | 90% less CPU |
| **Activity Loading** | All in memory | Paginated | 80% less RAM |
| **Chart.js** | Always loaded | Lazy loaded | 40MB savings |
| **Event Listeners** | Memory leaks | Proper cleanup | Prevents growth |

### User Experience Improvements:
- ✅ **Global shortcuts** - Work even when app is minimized
- ✅ **Quick switcher** - Instant activity switching (Ctrl+Shift+Q)
- ✅ **Inline editing** - No modal dialogs for simple edits
- ✅ **Time adjustment** - +/-5m/15m buttons
- ✅ **Enhanced floating timer** - Always-on-top with controls

---

## 🚀 Implementation Timeline

### Week 1: Memory Optimization
- **Day 1-2**: Fix timer performance + lazy loading
- **Day 3-4**: Implement activity pagination
- **Day 5**: Fix memory leaks + cleanup

### Week 2: Power-User Features
- **Day 1-2**: Global shortcuts + floating timer
- **Day 3-4**: Quick switcher + inline editing
- **Day 5**: Time adjustment + testing

### Week 3: Polish & Testing
- **Performance testing** on various systems
- **Memory profiling** to verify improvements
- **User testing** for power-user workflow

---

## 🎯 Success Metrics

### Performance Targets:
- [ ] **Memory usage < 150MB** during normal operation
- [ ] **Startup time < 4 seconds** from click to ready
- [ ] **CPU usage < 1%** when idle
- [ ] **No memory growth** over 8-hour sessions

### User Experience Targets:
- [ ] **Global shortcuts work** 100% of the time
- [ ] **Activity switching < 2 seconds** from shortcut to started
- [ ] **Inline editing works** for all text fields
- [ ] **Time adjustments** complete in < 500ms

This plan provides significant improvements to both resource usage and power-user experience while working within the existing architecture. All changes are additive enhancements rather than rewrites.

---

*Focus: Maximum impact with minimal architectural disruption*