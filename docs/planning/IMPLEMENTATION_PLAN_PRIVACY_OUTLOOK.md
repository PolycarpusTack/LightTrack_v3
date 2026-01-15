# Implementation Plan: Privacy (Do Not Track) & Advanced Outlook Integration

## Overview
This document outlines the implementation plan for adding Do Not Track/Incognito Mode and Advanced Outlook Integration features to the LightTrack redesign. These features existed in the legacy implementation and need to be modernized and integrated into the new architecture.

## Timeline Overview
- **Total Duration**: 6-8 weeks
- **Phase 1**: Do Not Track/Incognito Mode (3-4 weeks)
- **Phase 2**: Advanced Outlook Integration (3-4 weeks)

---

## Phase 1: Do Not Track/Incognito Mode Implementation (3-4 weeks)

### Week 1: Backend Foundation

#### 1.1 Privacy Service (Backend)
**Location**: `/src/main/services/PrivacyService.ts`

```typescript
interface PrivacyRule {
  id: string;
  type: 'app' | 'website' | 'pattern';
  pattern: string;
  matchType: 'exact' | 'contains' | 'regex';
  category: 'personal' | 'sensitive' | 'confidential' | 'break';
  enabled: boolean;
  createdAt: Date;
}

interface IncognitoSession {
  id: string;
  startTime: Date;
  endTime?: Date;
  autoExpireMinutes: number;
  activities: string[]; // Activity IDs tracked during session
}

class PrivacyService {
  // Core functionality
  - startIncognitoMode(duration?: number): IncognitoSession
  - stopIncognitoMode(): void
  - isIncognitoActive(): boolean
  - shouldTrackActivity(windowInfo: ActiveWindowInfo): boolean
  - addPrivacyRule(rule: PrivacyRule): void
  - removePrivacyRule(id: string): void
  - getPrivacyRules(): PrivacyRule[]
  - detectSensitiveActivity(windowInfo: ActiveWindowInfo): boolean
}
```

**Tasks**:
- [ ] Create PrivacyService class with singleton pattern
- [ ] Implement privacy rule storage (SQLite table)
- [ ] Add privacy rule matching logic (exact, contains, regex)
- [ ] Implement incognito session management
- [ ] Add automatic sensitive activity detection
- [ ] Create privacy event emitters

#### 1.2 Database Schema Updates
**Location**: `/src/main/database/migrations/`

```sql
-- Privacy rules table
CREATE TABLE privacy_rules (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  pattern TEXT NOT NULL,
  match_type TEXT NOT NULL,
  category TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Incognito sessions table
CREATE TABLE incognito_sessions (
  id TEXT PRIMARY KEY,
  start_time DATETIME NOT NULL,
  end_time DATETIME,
  auto_expire_minutes INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Update activities table
ALTER TABLE activities ADD COLUMN is_private INTEGER DEFAULT 0;
ALTER TABLE activities ADD COLUMN privacy_category TEXT;
```

**Tasks**:
- [ ] Create migration for privacy tables
- [ ] Update Activity entity with privacy fields
- [ ] Create PrivacyRule and IncognitoSession entities
- [ ] Update repositories with privacy methods

#### 1.3 Integration with ActivityService
**Location**: `/src/main/services/ActivityService.ts`

**Updates needed**:
```typescript
// In trackActiveWindow method
const windowInfo = await getActiveWindow();
if (windowInfo && !this.privacyService.shouldTrackActivity(windowInfo)) {
  // Mark current activity as ended if tracking stopped
  if (this.currentActivity && !this.currentActivity.isPrivate) {
    await this.stopActivity(this.currentActivity.id);
  }
  return;
}

// In startActivity method
const isIncognito = this.privacyService.isIncognitoActive();
const activity = await this.activityRepository.create({
  ...data,
  isPrivate: isIncognito,
  privacyCategory: isIncognito ? 'incognito' : undefined
});
```

**Tasks**:
- [ ] Inject PrivacyService into ActivityService
- [ ] Add privacy checks to window tracking
- [ ] Update activity creation for incognito mode
- [ ] Add privacy event handlers
- [ ] Implement auto-stop for sensitive activities

### Week 2: Frontend Components

#### 2.1 Privacy Settings Component
**Location**: `/src/renderer/components/settings/PrivacyRules.tsx`

**Features**:
- Privacy rules list with add/edit/delete
- Rule testing interface
- Import/export rules
- Default sensitive patterns
- Category management

**Tasks**:
- [ ] Create PrivacyRules component
- [ ] Design rule editor modal
- [ ] Implement pattern testing UI
- [ ] Add drag-and-drop rule ordering
- [ ] Create default rule templates

#### 2.2 Incognito Mode UI
**Location**: `/src/renderer/components/common/IncognitoIndicator.tsx`

**Features**:
- Floating incognito indicator
- Quick toggle button
- Timer showing session duration
- Auto-expire countdown
- Privacy stats display

**Tasks**:
- [ ] Create IncognitoIndicator component
- [ ] Add to MainLayout with positioning
- [ ] Implement session timer
- [ ] Add keyboard shortcut (Ctrl+Shift+I)
- [ ] Create privacy mode notifications

#### 2.3 Redux State Management
**Location**: `/src/renderer/store/slices/privacySlice.ts`

```typescript
interface PrivacyState {
  isIncognito: boolean;
  incognitoSession: IncognitoSession | null;
  privacyRules: PrivacyRule[];
  sensitiveAppDetected: boolean;
  privacyStats: {
    activitiesBlocked: number;
    incognitoTime: number;
    sensitiveDetections: number;
  };
}
```

**Tasks**:
- [ ] Create privacy slice
- [ ] Add privacy actions and reducers
- [ ] Create async thunks for privacy operations
- [ ] Update UI slice for privacy modals
- [ ] Add privacy selectors

### Week 3: Advanced Features & Testing

#### 3.1 Sensitive Activity Detection
**Location**: `/src/main/services/SensitiveActivityDetector.ts`

**Default Patterns**:
```typescript
const SENSITIVE_PATTERNS = {
  banking: [
    { pattern: /bank|chase|wells|citi|bofa/i, category: 'financial' },
    { pattern: /paypal|venmo|cashapp/i, category: 'financial' }
  ],
  medical: [
    { pattern: /patient|medical|health|doctor/i, category: 'medical' },
    { pattern: /mychart|kaiser|mayo/i, category: 'medical' }
  ],
  personal: [
    { pattern: /facebook|instagram|twitter|dating/i, category: 'personal' },
    { pattern: /gmail|outlook.*personal/i, category: 'personal' }
  ]
};
```

**Tasks**:
- [ ] Implement pattern-based detection
- [ ] Add ML-based classification (optional)
- [ ] Create notification system for detections
- [ ] Add user confirmation dialogs
- [ ] Implement learning from user feedback

#### 3.2 Privacy Analytics
**Location**: `/src/renderer/components/analytics/PrivacyInsights.tsx`

**Features**:
- Privacy mode usage statistics
- Sensitive activity detection logs
- Rule effectiveness metrics
- Privacy score/rating
- Recommendations

**Tasks**:
- [ ] Create privacy analytics component
- [ ] Design privacy dashboard
- [ ] Implement privacy metrics calculation
- [ ] Add privacy report generation
- [ ] Create privacy recommendations engine

#### 3.3 Testing & Documentation
- [ ] Unit tests for PrivacyService
- [ ] Integration tests for privacy rules
- [ ] E2E tests for incognito mode
- [ ] Performance testing for pattern matching
- [ ] User documentation for privacy features
- [ ] Privacy policy updates

---

## Phase 2: Advanced Outlook Integration (3-4 weeks)

### Week 4: Outlook Service Foundation

#### 4.1 Outlook Integration Service
**Location**: `/src/main/services/integrations/OutlookService.ts`

```typescript
interface OutlookActivity {
  type: 'email' | 'meeting' | 'task';
  subject: string;
  sender?: string;
  recipients?: string[];
  thread?: string;
  importance: 'low' | 'normal' | 'high';
  categories?: string[];
  startTime: Date;
  duration: number;
  attachments?: string[];
}

class OutlookService {
  // OAuth Integration
  - authenticate(): Promise<void>
  - refreshToken(): Promise<void>
  
  // Activity Tracking
  - trackEmailActivity(activity: OutlookActivity): void
  - trackMeetingActivity(activity: OutlookActivity): void
  - getActiveOutlookWindow(): Promise<OutlookActivity | null>
  
  // Analytics
  - getEmailStats(dateRange: DateRange): EmailStatistics
  - getMeetingEffectiveness(meetingId: string): MeetingMetrics
  - getCommunicationPatterns(): CommunicationAnalysis
}
```

**Tasks**:
- [ ] Create OutlookService with OAuth 2.0
- [ ] Implement Microsoft Graph API integration
- [ ] Add Outlook COM automation for desktop
- [ ] Create activity parsing logic
- [ ] Implement token management
- [ ] Add error handling and retry logic

#### 4.2 Window Title Parser
**Location**: `/src/main/services/integrations/OutlookWindowParser.ts`

**Patterns to Parse**:
```typescript
const OUTLOOK_PATTERNS = {
  email: /^(.+) - Message \(.*\)$/,
  meeting: /^(.+) - Meeting$/,
  calendar: /^Calendar - (.+) - Outlook$/,
  tasks: /^Tasks - (.+) - Outlook$/
};
```

**Tasks**:
- [ ] Create window title parser
- [ ] Extract email subjects and senders
- [ ] Identify meeting information
- [ ] Parse calendar views
- [ ] Handle different Outlook versions
- [ ] Add localization support

#### 4.3 Database Schema for Outlook Data
**Location**: `/src/main/database/migrations/`

```sql
-- Outlook activities table
CREATE TABLE outlook_activities (
  id TEXT PRIMARY KEY,
  activity_id TEXT REFERENCES activities(id),
  type TEXT NOT NULL,
  subject TEXT,
  sender TEXT,
  thread_id TEXT,
  importance TEXT,
  categories TEXT, -- JSON array
  attachments TEXT, -- JSON array
  metadata TEXT, -- JSON object
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Email threads table
CREATE TABLE email_threads (
  id TEXT PRIMARY KEY,
  subject TEXT,
  participants TEXT, -- JSON array
  message_count INTEGER,
  total_time_spent INTEGER,
  last_activity DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Tasks**:
- [ ] Create Outlook-specific tables
- [ ] Add indexes for performance
- [ ] Create entities and repositories
- [ ] Implement data aggregation queries
- [ ] Add cleanup/retention policies

### Week 5: Advanced Analytics

#### 5.1 Email Analytics Engine
**Location**: `/src/main/services/analytics/EmailAnalytics.ts`

**Metrics to Track**:
- Time spent per sender
- Response time analysis
- Email volume patterns
- Thread participation
- Peak email hours
- Attachment handling time

**Tasks**:
- [ ] Create email analytics service
- [ ] Implement sender ranking algorithm
- [ ] Add response time calculations
- [ ] Create email pattern detection
- [ ] Build thread analysis
- [ ] Generate email insights

#### 5.2 Meeting Effectiveness Analyzer
**Location**: `/src/main/services/analytics/MeetingAnalytics.ts`

**Features**:
- Actual vs. scheduled duration
- Meeting frequency analysis
- Attendee patterns
- Meeting cost calculation
- Effectiveness scoring
- Recommendations

**Tasks**:
- [ ] Create meeting analytics service
- [ ] Implement duration analysis
- [ ] Add meeting pattern detection
- [ ] Calculate meeting costs
- [ ] Generate effectiveness scores
- [ ] Create optimization suggestions

### Week 6: Frontend Integration

#### 6.1 Outlook Dashboard Component
**Location**: `/src/renderer/components/integrations/OutlookDashboard.tsx`

**Sections**:
- Email activity summary
- Top senders/recipients
- Thread timeline
- Meeting effectiveness
- Communication patterns
- Focus time analysis

**Tasks**:
- [ ] Create Outlook dashboard layout
- [ ] Design email analytics widgets
- [ ] Implement sender cloud visualization
- [ ] Add thread timeline component
- [ ] Create meeting effectiveness charts
- [ ] Build communication heatmap

#### 6.2 Outlook Settings Component
**Location**: `/src/renderer/components/settings/OutlookSettings.tsx`

**Features**:
- OAuth connection management
- Tracking preferences
- Privacy settings for emails
- Sender importance configuration
- Category mappings
- Sync frequency

**Tasks**:
- [ ] Create Outlook settings UI
- [ ] Implement OAuth flow UI
- [ ] Add tracking toggles
- [ ] Create sender management
- [ ] Build category mapper
- [ ] Add sync controls

#### 6.3 Real-time Outlook Tracking
**Location**: `/src/renderer/hooks/useOutlookTracking.ts`

```typescript
const useOutlookTracking = () => {
  // Real-time email/meeting tracking
  // Updates current activity with Outlook context
  // Shows inline Outlook information
};
```

**Tasks**:
- [ ] Create Outlook tracking hook
- [ ] Implement real-time updates
- [ ] Add Outlook context to activities
- [ ] Create notification system
- [ ] Build quick actions menu
- [ ] Add keyboard shortcuts

### Week 7-8: Testing & Polish

#### Testing Requirements
- [ ] Unit tests for all Outlook services
- [ ] Integration tests with mock Outlook
- [ ] E2E tests for OAuth flow
- [ ] Performance tests for analytics
- [ ] Security audit for OAuth tokens
- [ ] Cross-platform testing (Windows/Mac)

#### Documentation
- [ ] User guide for Outlook integration
- [ ] Privacy considerations documentation
- [ ] API documentation
- [ ] Troubleshooting guide
- [ ] Admin configuration guide

#### Polish & Optimization
- [ ] Performance optimization for large mailboxes
- [ ] Memory usage optimization
- [ ] UI/UX improvements based on feedback
- [ ] Error message improvements
- [ ] Loading state optimizations

---

## Technical Considerations

### Architecture Decisions
1. **Privacy Service**: Singleton pattern for consistent state
2. **Pattern Matching**: Use compiled regex for performance
3. **Outlook Integration**: Dual approach (Graph API + COM)
4. **Data Storage**: Separate tables for privacy/Outlook data
5. **Analytics**: Batch processing for performance

### Security Considerations
1. **OAuth Tokens**: Encrypted storage in system keychain
2. **Privacy Rules**: Encrypted at rest
3. **Sensitive Data**: Never logged or exported
4. **Incognito Mode**: No persistence of activity data
5. **Outlook Data**: Minimal storage, on-demand fetch

### Performance Targets
1. **Privacy Checks**: < 5ms per window check
2. **Pattern Matching**: < 10ms for all rules
3. **Outlook Sync**: Incremental, < 30s full sync
4. **Analytics**: Cached, < 1s dashboard load
5. **Memory**: < 50MB for privacy/Outlook services

### Migration Strategy
1. Import existing privacy rules from legacy
2. Migrate Outlook credentials securely
3. Preserve user preferences
4. One-time full Outlook sync
5. Gradual feature rollout

---

## Risk Mitigation

### Technical Risks
1. **Outlook COM Issues**: Fallback to Graph API only
2. **Performance Impact**: Implement sampling/throttling
3. **Privacy Rule Conflicts**: Rule priority system
4. **OAuth Expiration**: Proactive token refresh
5. **Large Data Volumes**: Pagination and archival

### User Experience Risks
1. **Complexity**: Progressive disclosure of features
2. **Privacy Concerns**: Clear data usage explanations
3. **Performance**: Background processing with indicators
4. **Errors**: Graceful degradation, clear messages
5. **Adoption**: Guided setup, feature tours

---

## Success Metrics

### Privacy Features
- 90% reduction in sensitive data tracking
- < 5% false positive rate for detection
- 100% data isolation in incognito mode
- User satisfaction > 4.5/5

### Outlook Integration  
- < 2 minute setup time
- 95% email activity capture rate
- < 5% impact on app performance
- 80% user adoption rate

---

## Next Steps

1. **Review & Approval**: Architecture and security review
2. **Environment Setup**: OAuth app registration
3. **Team Assignment**: 2 developers, 1 QA
4. **Sprint Planning**: Break down into 2-week sprints
5. **Kickoff**: Week of [DATE]

---

*This implementation plan provides a structured approach to adding privacy and Outlook features while maintaining code quality, performance, and user experience standards.*