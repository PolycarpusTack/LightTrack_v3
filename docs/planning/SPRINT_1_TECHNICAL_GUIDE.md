# Sprint 1: Privacy Service Implementation - Technical Guide

## Overview
This guide provides detailed implementation steps for the first sprint of the Privacy/Do Not Track feature. Sprint duration: 2 weeks.

## Prerequisites
- Existing LightTrack redesign codebase
- Node.js environment
- SQLite database
- Understanding of TypeScript and Electron

---

## Day 1-2: Privacy Service Core

### Step 1: Create Privacy Service Base

**File**: `/src/main/services/PrivacyService.ts`

```typescript
import { EventEmitter } from 'events';
import { serviceLogger } from '../utils/logger';
import { getActiveWindow, ActiveWindowInfo } from '../utils/activeWindow';
import { v4 as uuidv4 } from 'uuid';

export interface PrivacyRule {
  id: string;
  type: 'app' | 'website' | 'pattern';
  pattern: string;
  matchType: 'exact' | 'contains' | 'regex';
  category: 'personal' | 'sensitive' | 'confidential' | 'break';
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IncognitoSession {
  id: string;
  startTime: Date;
  endTime?: Date;
  autoExpireMinutes: number;
  activities: string[];
}

export class PrivacyService extends EventEmitter {
  private static instance: PrivacyService;
  private incognitoSession: IncognitoSession | null = null;
  private privacyRules: Map<string, PrivacyRule> = new Map();
  private compiledPatterns: Map<string, RegExp> = new Map();
  private incognitoTimer: NodeJS.Timeout | null = null;

  private constructor() {
    super();
    this.loadPrivacyRules();
  }

  static getInstance(): PrivacyService {
    if (!PrivacyService.instance) {
      PrivacyService.instance = new PrivacyService();
    }
    return PrivacyService.instance;
  }

  async startIncognitoMode(durationMinutes: number = 60): Promise<IncognitoSession> {
    if (this.incognitoSession) {
      this.stopIncognitoMode();
    }

    this.incognitoSession = {
      id: uuidv4(),
      startTime: new Date(),
      autoExpireMinutes: durationMinutes,
      activities: []
    };

    // Set auto-expire timer
    this.incognitoTimer = setTimeout(() => {
      this.stopIncognitoMode();
    }, durationMinutes * 60 * 1000);

    serviceLogger.info(`Incognito mode started for ${durationMinutes} minutes`);
    this.emit('incognito:started', this.incognitoSession);
    
    return this.incognitoSession;
  }

  stopIncognitoMode(): void {
    if (!this.incognitoSession) return;

    this.incognitoSession.endTime = new Date();
    
    if (this.incognitoTimer) {
      clearTimeout(this.incognitoTimer);
      this.incognitoTimer = null;
    }

    const session = this.incognitoSession;
    this.incognitoSession = null;

    serviceLogger.info('Incognito mode stopped');
    this.emit('incognito:stopped', session);
  }

  isIncognitoActive(): boolean {
    return this.incognitoSession !== null;
  }

  shouldTrackActivity(windowInfo: ActiveWindowInfo): boolean {
    // Check if incognito mode is active
    if (this.isIncognitoActive()) {
      return false;
    }

    // Check privacy rules
    for (const rule of this.privacyRules.values()) {
      if (!rule.enabled) continue;

      if (this.matchesRule(windowInfo, rule)) {
        serviceLogger.debug(`Activity blocked by privacy rule: ${rule.id}`);
        this.emit('activity:blocked', { windowInfo, rule });
        return false;
      }
    }

    // Check for sensitive activity detection
    if (this.detectSensitiveActivity(windowInfo)) {
      this.emit('sensitive:detected', windowInfo);
      return false;
    }

    return true;
  }

  private matchesRule(windowInfo: ActiveWindowInfo, rule: PrivacyRule): boolean {
    const target = rule.type === 'app' ? windowInfo.app : windowInfo.title;
    
    switch (rule.matchType) {
      case 'exact':
        return target.toLowerCase() === rule.pattern.toLowerCase();
      
      case 'contains':
        return target.toLowerCase().includes(rule.pattern.toLowerCase());
      
      case 'regex':
        const regex = this.getCompiledPattern(rule);
        return regex.test(target);
      
      default:
        return false;
    }
  }

  private getCompiledPattern(rule: PrivacyRule): RegExp {
    if (!this.compiledPatterns.has(rule.id)) {
      try {
        this.compiledPatterns.set(rule.id, new RegExp(rule.pattern, 'i'));
      } catch (error) {
        serviceLogger.error(`Invalid regex pattern for rule ${rule.id}: ${rule.pattern}`);
        this.compiledPatterns.set(rule.id, /(?!)/); // Never match
      }
    }
    return this.compiledPatterns.get(rule.id)!;
  }

  detectSensitiveActivity(windowInfo: ActiveWindowInfo): boolean {
    const sensitivePatterns = [
      /bank|chase|wells|citi|bofa/i,
      /paypal|venmo|cashapp|zelle/i,
      /patient|medical|health|doctor/i,
      /mychart|kaiser|mayo|healthcare/i,
      /tax|irs|turbotax|hrblock/i,
      /password|lastpass|1password|bitwarden/i
    ];

    const textToCheck = `${windowInfo.app} ${windowInfo.title}`.toLowerCase();
    
    return sensitivePatterns.some(pattern => pattern.test(textToCheck));
  }

  // To be continued...
}
```

### Step 2: Privacy Rule Management

**Add to** `/src/main/services/PrivacyService.ts`:

```typescript
  async addPrivacyRule(rule: Omit<PrivacyRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<PrivacyRule> {
    const newRule: PrivacyRule = {
      ...rule,
      id: uuidv4(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.privacyRules.set(newRule.id, newRule);
    await this.savePrivacyRules();
    
    serviceLogger.info(`Privacy rule added: ${newRule.id}`);
    this.emit('rule:added', newRule);
    
    return newRule;
  }

  async updatePrivacyRule(id: string, updates: Partial<PrivacyRule>): Promise<PrivacyRule | null> {
    const rule = this.privacyRules.get(id);
    if (!rule) return null;

    const updatedRule = {
      ...rule,
      ...updates,
      id: rule.id, // Ensure ID cannot be changed
      createdAt: rule.createdAt, // Ensure creation date cannot be changed
      updatedAt: new Date()
    };

    this.privacyRules.set(id, updatedRule);
    
    // Clear compiled pattern if pattern or matchType changed
    if (updates.pattern || updates.matchType) {
      this.compiledPatterns.delete(id);
    }
    
    await this.savePrivacyRules();
    
    serviceLogger.info(`Privacy rule updated: ${id}`);
    this.emit('rule:updated', updatedRule);
    
    return updatedRule;
  }

  async removePrivacyRule(id: string): Promise<boolean> {
    const deleted = this.privacyRules.delete(id);
    if (deleted) {
      this.compiledPatterns.delete(id);
      await this.savePrivacyRules();
      
      serviceLogger.info(`Privacy rule removed: ${id}`);
      this.emit('rule:removed', id);
    }
    
    return deleted;
  }

  getPrivacyRules(): PrivacyRule[] {
    return Array.from(this.privacyRules.values());
  }

  getPrivacyRule(id: string): PrivacyRule | undefined {
    return this.privacyRules.get(id);
  }
```

---

## Day 3-4: Database Integration

### Step 1: Create Migration

**File**: `/src/main/database/migrations/003_add_privacy_tables.sql`

```sql
-- Privacy rules table
CREATE TABLE IF NOT EXISTS privacy_rules (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('app', 'website', 'pattern')),
  pattern TEXT NOT NULL,
  match_type TEXT NOT NULL CHECK(match_type IN ('exact', 'contains', 'regex')),
  category TEXT NOT NULL CHECK(category IN ('personal', 'sensitive', 'confidential', 'break')),
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Incognito sessions table
CREATE TABLE IF NOT EXISTS incognito_sessions (
  id TEXT PRIMARY KEY,
  start_time DATETIME NOT NULL,
  end_time DATETIME,
  auto_expire_minutes INTEGER NOT NULL,
  activities_count INTEGER DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add privacy fields to activities table
ALTER TABLE activities ADD COLUMN is_private INTEGER DEFAULT 0;
ALTER TABLE activities ADD COLUMN privacy_category TEXT;
ALTER TABLE activities ADD COLUMN incognito_session_id TEXT REFERENCES incognito_sessions(id);

-- Create indexes for performance
CREATE INDEX idx_privacy_rules_enabled ON privacy_rules(enabled);
CREATE INDEX idx_privacy_rules_type ON privacy_rules(type);
CREATE INDEX idx_activities_private ON activities(is_private);
CREATE INDEX idx_activities_incognito ON activities(incognito_session_id);
```

### Step 2: Create Privacy Repository

**File**: `/src/main/database/repositories/PrivacyRepository.ts`

```typescript
import { BaseRepository } from './BaseRepository';
import { PrivacyRule, IncognitoSession } from '../../services/PrivacyService';

export class PrivacyRuleRepository extends BaseRepository<PrivacyRule> {
  constructor() {
    super('privacy_rules');
  }

  async findAllEnabled(): Promise<PrivacyRule[]> {
    const query = `SELECT * FROM ${this.tableName} WHERE enabled = 1 ORDER BY created_at DESC`;
    const rows = await this.db.all(query);
    return rows.map(row => this.mapRowToEntity(row));
  }

  async findByCategory(category: string): Promise<PrivacyRule[]> {
    const query = `SELECT * FROM ${this.tableName} WHERE category = ? ORDER BY created_at DESC`;
    const rows = await this.db.all(query, [category]);
    return rows.map(row => this.mapRowToEntity(row));
  }

  protected mapRowToEntity(row: any): PrivacyRule {
    return {
      id: row.id,
      type: row.type,
      pattern: row.pattern,
      matchType: row.match_type,
      category: row.category,
      enabled: Boolean(row.enabled),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  protected mapEntityToRow(entity: PrivacyRule): any {
    return {
      id: entity.id,
      type: entity.type,
      pattern: entity.pattern,
      match_type: entity.matchType,
      category: entity.category,
      enabled: entity.enabled ? 1 : 0,
      created_at: entity.createdAt.toISOString(),
      updated_at: entity.updatedAt.toISOString()
    };
  }
}

export class IncognitoSessionRepository extends BaseRepository<IncognitoSession> {
  constructor() {
    super('incognito_sessions');
  }

  async findActive(): Promise<IncognitoSession | null> {
    const query = `SELECT * FROM ${this.tableName} WHERE end_time IS NULL ORDER BY start_time DESC LIMIT 1`;
    const row = await this.db.get(query);
    return row ? this.mapRowToEntity(row) : null;
  }

  async updateActivityCount(sessionId: string, count: number): Promise<void> {
    const query = `UPDATE ${this.tableName} SET activities_count = ? WHERE id = ?`;
    await this.db.run(query, [count, sessionId]);
  }

  protected mapRowToEntity(row: any): IncognitoSession {
    return {
      id: row.id,
      startTime: new Date(row.start_time),
      endTime: row.end_time ? new Date(row.end_time) : undefined,
      autoExpireMinutes: row.auto_expire_minutes,
      activities: [] // Activities are loaded separately
    };
  }

  protected mapEntityToRow(entity: IncognitoSession): any {
    return {
      id: entity.id,
      start_time: entity.startTime.toISOString(),
      end_time: entity.endTime?.toISOString() || null,
      auto_expire_minutes: entity.autoExpireMinutes,
      activities_count: entity.activities.length
    };
  }
}
```

### Step 3: Update Privacy Service with Repository

**Update** `/src/main/services/PrivacyService.ts`:

```typescript
import { PrivacyRuleRepository, IncognitoSessionRepository } from '../database/repositories/PrivacyRepository';

export class PrivacyService extends EventEmitter {
  private privacyRuleRepository: PrivacyRuleRepository;
  private incognitoSessionRepository: IncognitoSessionRepository;

  private constructor() {
    super();
    this.privacyRuleRepository = new PrivacyRuleRepository();
    this.incognitoSessionRepository = new IncognitoSessionRepository();
    this.initialize();
  }

  private async initialize(): Promise<void> {
    await this.loadPrivacyRules();
    await this.checkActiveIncognitoSession();
  }

  private async loadPrivacyRules(): Promise<void> {
    try {
      const rules = await this.privacyRuleRepository.findAllEnabled();
      this.privacyRules.clear();
      this.compiledPatterns.clear();
      
      rules.forEach(rule => {
        this.privacyRules.set(rule.id, rule);
      });
      
      serviceLogger.info(`Loaded ${rules.length} privacy rules`);
    } catch (error) {
      serviceLogger.error('Failed to load privacy rules:', error);
    }
  }

  private async checkActiveIncognitoSession(): Promise<void> {
    try {
      const activeSession = await this.incognitoSessionRepository.findActive();
      if (activeSession) {
        const elapsed = Date.now() - activeSession.startTime.getTime();
        const remaining = (activeSession.autoExpireMinutes * 60 * 1000) - elapsed;
        
        if (remaining > 0) {
          this.incognitoSession = activeSession;
          this.incognitoTimer = setTimeout(() => {
            this.stopIncognitoMode();
          }, remaining);
          
          serviceLogger.info('Resumed active incognito session');
        } else {
          // Session expired while app was closed
          await this.incognitoSessionRepository.update(activeSession.id, {
            endTime: new Date()
          });
        }
      }
    } catch (error) {
      serviceLogger.error('Failed to check active incognito session:', error);
    }
  }

  private async savePrivacyRules(): Promise<void> {
    // Repository handles individual saves
    // This method is for backwards compatibility
  }
}
```

---

## Day 5-6: Activity Service Integration

### Step 1: Update Activity Entity

**File**: `/src/main/database/entities/Activity.ts`

```typescript
@Entity()
export class Activity {
  // ... existing fields ...

  @Column({ default: false })
  isPrivate: boolean;

  @Column({ nullable: true })
  privacyCategory?: string;

  @Column({ nullable: true })
  incognitoSessionId?: string;

  @ManyToOne(() => IncognitoSession, { nullable: true })
  @JoinColumn({ name: 'incognito_session_id' })
  incognitoSession?: IncognitoSession;
}
```

### Step 2: Update ActivityService

**File**: `/src/main/services/ActivityService.ts`

```typescript
import { PrivacyService } from './PrivacyService';

export class ActivityService extends EventEmitter {
  private privacyService: PrivacyService;

  private constructor() {
    super();
    this.privacyService = PrivacyService.getInstance();
    this.setupPrivacyHandlers();
  }

  private setupPrivacyHandlers(): void {
    // Stop current activity when incognito starts
    this.privacyService.on('incognito:started', () => {
      if (this.currentActivity && !this.currentActivity.isPrivate) {
        this.stopActivity(this.currentActivity.id);
      }
    });

    // Handle sensitive activity detection
    this.privacyService.on('sensitive:detected', (windowInfo) => {
      this.handleSensitiveActivityDetected(windowInfo);
    });
  }

  async startActivity(data: ActivityData): Promise<ActivityDto> {
    try {
      // ... existing validation ...

      const isIncognito = this.privacyService.isIncognitoActive();
      const incognitoSession = isIncognito ? 
        this.privacyService.getCurrentIncognitoSession() : null;

      // Create activity with privacy settings
      const activity = await this.activityRepository.create({
        name: data.name,
        description: data.description,
        projectId,
        categoryId: data.categoryId,
        startTime: data.startTime || new Date(),
        isManualEntry: data.isManualEntry || false,
        tags,
        isPrivate: isIncognito,
        privacyCategory: isIncognito ? 'incognito' : undefined,
        incognitoSessionId: incognitoSession?.id
      });

      // ... rest of method ...
    } catch (error) {
      serviceLogger.error('Failed to start activity:', error);
      throw error;
    }
  }

  private async trackActiveWindow(): Promise<void> {
    try {
      if (!this.currentActivity || this.currentActivity.isPaused) {
        return;
      }

      const windowInfo = await getActiveWindow();
      
      if (!windowInfo) {
        return;
      }

      // Check if activity should be tracked
      if (!this.privacyService.shouldTrackActivity(windowInfo)) {
        // Stop tracking if privacy rule matched
        if (!this.currentActivity.isPrivate) {
          await this.stopActivity(this.currentActivity.id);
          this.emit('activity:privacy-stopped', {
            activityId: this.currentActivity.id,
            reason: 'privacy-rule'
          });
        }
        return;
      }

      // ... existing window tracking logic ...
    } catch (error) {
      serviceLogger.error('Failed to track active window:', error);
    }
  }

  private async handleSensitiveActivityDetected(windowInfo: ActiveWindowInfo): Promise<void> {
    // Emit event for UI to show notification
    this.emit('sensitive:activity:detected', windowInfo);
    
    // Optionally auto-start incognito mode
    const settings = await this.settingsService.getPrivacySettings();
    if (settings.autoIncognitoOnSensitive) {
      await this.privacyService.startIncognitoMode(30); // 30 minutes default
    }
  }
}
```

---

## Day 7-8: IPC Communication Layer

### Step 1: Privacy IPC Handlers

**File**: `/src/main/ipc/privacyHandlers.ts`

```typescript
import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { PrivacyService } from '../services/PrivacyService';
import { serviceLogger } from '../utils/logger';

export function registerPrivacyHandlers(): void {
  const privacyService = PrivacyService.getInstance();

  // Incognito mode handlers
  ipcMain.handle('privacy:startIncognito', async (event: IpcMainInvokeEvent, duration: number) => {
    try {
      return await privacyService.startIncognitoMode(duration);
    } catch (error) {
      serviceLogger.error('Failed to start incognito mode:', error);
      throw error;
    }
  });

  ipcMain.handle('privacy:stopIncognito', async () => {
    try {
      privacyService.stopIncognitoMode();
      return true;
    } catch (error) {
      serviceLogger.error('Failed to stop incognito mode:', error);
      throw error;
    }
  });

  ipcMain.handle('privacy:isIncognitoActive', async () => {
    return privacyService.isIncognitoActive();
  });

  ipcMain.handle('privacy:getIncognitoSession', async () => {
    return privacyService.getCurrentIncognitoSession();
  });

  // Privacy rules handlers
  ipcMain.handle('privacy:getRules', async () => {
    return privacyService.getPrivacyRules();
  });

  ipcMain.handle('privacy:addRule', async (event, rule) => {
    try {
      return await privacyService.addPrivacyRule(rule);
    } catch (error) {
      serviceLogger.error('Failed to add privacy rule:', error);
      throw error;
    }
  });

  ipcMain.handle('privacy:updateRule', async (event, id: string, updates) => {
    try {
      return await privacyService.updatePrivacyRule(id, updates);
    } catch (error) {
      serviceLogger.error('Failed to update privacy rule:', error);
      throw error;
    }
  });

  ipcMain.handle('privacy:removeRule', async (event, id: string) => {
    try {
      return await privacyService.removePrivacyRule(id);
    } catch (error) {
      serviceLogger.error('Failed to remove privacy rule:', error);
      throw error;
    }
  });

  ipcMain.handle('privacy:testRule', async (event, windowInfo, rule) => {
    try {
      return privacyService.testPrivacyRule(windowInfo, rule);
    } catch (error) {
      serviceLogger.error('Failed to test privacy rule:', error);
      throw error;
    }
  });

  // Forward privacy events to renderer
  privacyService.on('incognito:started', (session) => {
    event.sender.send('privacy:incognito:started', session);
  });

  privacyService.on('incognito:stopped', (session) => {
    event.sender.send('privacy:incognito:stopped', session);
  });

  privacyService.on('sensitive:detected', (windowInfo) => {
    event.sender.send('privacy:sensitive:detected', windowInfo);
  });

  privacyService.on('activity:blocked', (data) => {
    event.sender.send('privacy:activity:blocked', data);
  });
}
```

### Step 2: Frontend API Client

**File**: `/src/renderer/api/privacyAPI.ts`

```typescript
import { ipcRenderer } from 'electron';
import { PrivacyRule, IncognitoSession } from '@shared/types/privacy';

export const privacyAPI = {
  // Incognito mode
  startIncognito: (duration: number): Promise<IncognitoSession> => 
    ipcRenderer.invoke('privacy:startIncognito', duration),
  
  stopIncognito: (): Promise<boolean> => 
    ipcRenderer.invoke('privacy:stopIncognito'),
  
  isIncognitoActive: (): Promise<boolean> => 
    ipcRenderer.invoke('privacy:isIncognitoActive'),
  
  getIncognitoSession: (): Promise<IncognitoSession | null> => 
    ipcRenderer.invoke('privacy:getIncognitoSession'),

  // Privacy rules
  getRules: (): Promise<PrivacyRule[]> => 
    ipcRenderer.invoke('privacy:getRules'),
  
  addRule: (rule: Omit<PrivacyRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<PrivacyRule> => 
    ipcRenderer.invoke('privacy:addRule', rule),
  
  updateRule: (id: string, updates: Partial<PrivacyRule>): Promise<PrivacyRule | null> => 
    ipcRenderer.invoke('privacy:updateRule', id, updates),
  
  removeRule: (id: string): Promise<boolean> => 
    ipcRenderer.invoke('privacy:removeRule', id),
  
  testRule: (windowInfo: any, rule: PrivacyRule): Promise<boolean> => 
    ipcRenderer.invoke('privacy:testRule', windowInfo, rule),

  // Event listeners
  onIncognitoStarted: (callback: (session: IncognitoSession) => void) => {
    ipcRenderer.on('privacy:incognito:started', (event, session) => callback(session));
  },
  
  onIncognitoStopped: (callback: (session: IncognitoSession) => void) => {
    ipcRenderer.on('privacy:incognito:stopped', (event, session) => callback(session));
  },
  
  onSensitiveDetected: (callback: (windowInfo: any) => void) => {
    ipcRenderer.on('privacy:sensitive:detected', (event, windowInfo) => callback(windowInfo));
  },
  
  onActivityBlocked: (callback: (data: any) => void) => {
    ipcRenderer.on('privacy:activity:blocked', (event, data) => callback(data));
  }
};
```

---

## Day 9-10: Testing & Documentation

### Step 1: Unit Tests

**File**: `/src/main/services/__tests__/PrivacyService.test.ts`

```typescript
import { PrivacyService } from '../PrivacyService';
import { ActiveWindowInfo } from '../../utils/activeWindow';

describe('PrivacyService', () => {
  let privacyService: PrivacyService;

  beforeEach(() => {
    privacyService = PrivacyService.getInstance();
  });

  describe('Incognito Mode', () => {
    test('should start incognito mode', async () => {
      const session = await privacyService.startIncognitoMode(30);
      
      expect(session).toBeDefined();
      expect(session.autoExpireMinutes).toBe(30);
      expect(privacyService.isIncognitoActive()).toBe(true);
    });

    test('should stop incognito mode', async () => {
      await privacyService.startIncognitoMode(30);
      privacyService.stopIncognitoMode();
      
      expect(privacyService.isIncognitoActive()).toBe(false);
    });

    test('should auto-expire incognito mode', async () => {
      jest.useFakeTimers();
      
      await privacyService.startIncognitoMode(1); // 1 minute
      expect(privacyService.isIncognitoActive()).toBe(true);
      
      jest.advanceTimersByTime(61000); // 61 seconds
      expect(privacyService.isIncognitoActive()).toBe(false);
      
      jest.useRealTimers();
    });
  });

  describe('Privacy Rules', () => {
    test('should add privacy rule', async () => {
      const rule = await privacyService.addPrivacyRule({
        type: 'app',
        pattern: 'Slack',
        matchType: 'exact',
        category: 'personal',
        enabled: true
      });
      
      expect(rule.id).toBeDefined();
      expect(rule.pattern).toBe('Slack');
    });

    test('should match exact rule', async () => {
      await privacyService.addPrivacyRule({
        type: 'app',
        pattern: 'Discord',
        matchType: 'exact',
        category: 'personal',
        enabled: true
      });

      const windowInfo: ActiveWindowInfo = {
        app: 'Discord',
        title: 'General - Discord',
        pid: 1234
      };

      expect(privacyService.shouldTrackActivity(windowInfo)).toBe(false);
    });

    test('should match contains rule', async () => {
      await privacyService.addPrivacyRule({
        type: 'website',
        pattern: 'facebook',
        matchType: 'contains',
        category: 'personal',
        enabled: true
      });

      const windowInfo: ActiveWindowInfo = {
        app: 'Chrome',
        title: 'Facebook - Google Chrome',
        pid: 1234
      };

      expect(privacyService.shouldTrackActivity(windowInfo)).toBe(false);
    });

    test('should match regex rule', async () => {
      await privacyService.addPrivacyRule({
        type: 'pattern',
        pattern: '^.*\\.(bank|chase|wells)\\.',
        matchType: 'regex',
        category: 'sensitive',
        enabled: true
      });

      const windowInfo: ActiveWindowInfo = {
        app: 'Chrome',
        title: 'www.chase.com - Google Chrome',
        pid: 1234
      };

      expect(privacyService.shouldTrackActivity(windowInfo)).toBe(false);
    });
  });

  describe('Sensitive Activity Detection', () => {
    test('should detect banking activity', () => {
      const windowInfo: ActiveWindowInfo = {
        app: 'Chrome',
        title: 'Bank of America Online Banking',
        pid: 1234
      };

      expect(privacyService.detectSensitiveActivity(windowInfo)).toBe(true);
    });

    test('should detect medical activity', () => {
      const windowInfo: ActiveWindowInfo = {
        app: 'Chrome',
        title: 'MyChart - Patient Portal',
        pid: 1234
      };

      expect(privacyService.detectSensitiveActivity(windowInfo)).toBe(true);
    });

    test('should not detect normal activity as sensitive', () => {
      const windowInfo: ActiveWindowInfo = {
        app: 'VSCode',
        title: 'index.ts - Visual Studio Code',
        pid: 1234
      };

      expect(privacyService.detectSensitiveActivity(windowInfo)).toBe(false);
    });
  });
});
```

### Step 2: Default Privacy Rules

**File**: `/src/main/services/privacy/defaultRules.ts`

```typescript
export const DEFAULT_PRIVACY_RULES = [
  // Personal/Social
  {
    type: 'website',
    pattern: 'facebook',
    matchType: 'contains',
    category: 'personal',
    enabled: false,
    description: 'Facebook social media'
  },
  {
    type: 'website',
    pattern: 'instagram',
    matchType: 'contains',
    category: 'personal',
    enabled: false,
    description: 'Instagram social media'
  },
  {
    type: 'website',
    pattern: 'twitter',
    matchType: 'contains',
    category: 'personal',
    enabled: false,
    description: 'Twitter/X social media'
  },
  
  // Financial
  {
    type: 'pattern',
    pattern: 'bank|chase|wells|citi|bofa',
    matchType: 'regex',
    category: 'sensitive',
    enabled: true,
    description: 'Banking websites'
  },
  {
    type: 'pattern',
    pattern: 'paypal|venmo|cashapp|zelle',
    matchType: 'regex',
    category: 'sensitive',
    enabled: true,
    description: 'Payment services'
  },
  
  // Medical
  {
    type: 'pattern',
    pattern: 'mychart|patient.*portal|healthcare',
    matchType: 'regex',
    category: 'sensitive',
    enabled: true,
    description: 'Medical portals'
  },
  
  // Entertainment
  {
    type: 'website',
    pattern: 'youtube',
    matchType: 'contains',
    category: 'break',
    enabled: false,
    description: 'YouTube videos'
  },
  {
    type: 'website',
    pattern: 'netflix|hulu|disney',
    matchType: 'regex',
    category: 'break',
    enabled: false,
    description: 'Streaming services'
  },
  
  // Password Managers
  {
    type: 'app',
    pattern: '1Password|LastPass|Bitwarden|KeePass',
    matchType: 'regex',
    category: 'sensitive',
    enabled: true,
    description: 'Password managers'
  }
];
```

---

## Testing Checklist

### Backend Tests
- [ ] PrivacyService unit tests
- [ ] Privacy rule matching tests
- [ ] Incognito mode lifecycle tests
- [ ] Database integration tests
- [ ] IPC handler tests
- [ ] Performance tests (rule matching < 5ms)

### Integration Tests
- [ ] Activity tracking with privacy rules
- [ ] Incognito mode with activity service
- [ ] Privacy events propagation
- [ ] Database persistence
- [ ] Error handling

### Manual Testing
- [ ] Start/stop incognito mode
- [ ] Add/edit/delete privacy rules
- [ ] Test rule matching
- [ ] Sensitive activity detection
- [ ] Auto-expire incognito mode
- [ ] Privacy notifications

---

## Next Steps

1. **Frontend Implementation** (Week 2)
   - Privacy settings UI
   - Incognito indicator
   - Redux integration
   - Notifications

2. **Advanced Features** (Week 3)
   - ML-based detection
   - Privacy analytics
   - Rule templates
   - Import/export

3. **Performance Optimization**
   - Rule caching
   - Batch processing
   - Background workers

---

*This technical guide provides the foundation for implementing privacy features. Follow the implementation order and ensure all tests pass before proceeding to the next phase.*