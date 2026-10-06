/**
 * IPC contract (LT3-003): every channel the renderer can invoke.
 *
 * Each entry gives the argument tuple and the result schema. The registry
 * (./registry.ts) validates both in main; the preload (src/preload/index.ts) can
 * only name channels listed here. Tuples are strict: extra arguments are refused.
 *
 * Request objects use z.object, which drops unknown keys, so the renderer cannot
 * store fields main does not know about. Stored records use z.looseObject, so
 * older data with extra fields still passes; only the fields main relies on are typed.
 *
 * To add a channel: add it here, register it with registry.handle() in main and
 * map it in the preload. The contract test fails if the three sets differ.
 */
import { z } from 'zod';

// ---------- shared pieces ----------

const Id = z.union([z.string().min(1).max(100), z.number()]);
const DateText = z.string().max(40);
const Name = z.string().max(100);
const Pattern = z.string().min(1).max(200);
const Code = z.string().max(50);
const Success = z.looseObject({ success: z.boolean() });

/** All, system and custom entries (tags, projects, activity types). */
const Groups = <T extends z.ZodType>(item: T) => z.looseObject({
  system: z.array(item),
  custom: z.array(item),
  all: z.array(item)
});

const Activity = z.looseObject({
  id: Id.optional(),
  title: z.string().nullish(),
  app: z.string().nullish(),
  project: z.string().nullish(),
  startTime: z.string().nullish(),
  endTime: z.string().nullish(),
  duration: z.number().nullish(),
  tags: z.array(z.string()).nullish()
});

/** Fields the renderer may set on a manual or edited activity. */
const ActivityInput = z.object({
  title: z.string().max(500).optional(),
  app: z.string().max(100).optional(),
  project: z.string().max(100).optional(),
  activity: z.string().max(100).optional(),
  activityType: z.string().max(100).optional(),
  description: z.string().max(2000).optional(),
  startTime: DateText.optional(),
  endTime: DateText.optional(),
  duration: z.number().nonnegative().optional(),
  billable: z.boolean().optional(),
  isManual: z.boolean().optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  tickets: z.array(z.string().max(50)).max(50).optional(),
  sapCode: Code.optional(),
  costCenter: Code.optional(),
  wbsElement: Code.optional()
});

const Project = z.looseObject({
  id: z.string(),
  name: z.string(),
  isSystem: z.boolean().optional()
});

const ProjectInput = z.object({
  name: Name,
  sapCode: Code.optional(),
  costCenter: Code.optional(),
  wbsElement: Code.optional()
});

const ActivityType = z.looseObject({ id: z.string(), name: z.string() });

/** A mapping points at a project name, or at a project plus booking details. */
const MappingValue = z.union([
  Name,
  z.object({
    project: Name,
    activity: z.string().max(100).optional(),
    sapCode: Code.optional(),
    costCenter: Code.optional(),
    wbsElement: Code.optional(),
    tags: z.array(z.string().max(50)).max(20).optional()
  })
]);
const Mappings = z.record(z.string(), z.union([z.string(), z.looseObject({ project: z.string().optional() })]));

const Settings = z.object({
  deepWorkTarget: z.number().nullish(),
  breaksTarget: z.number().nullish(),
  workDayStart: z.string().max(5).nullish(),
  workDayEnd: z.string().max(5).nullish(),
  defaultProject: Name.nullish(),
  launchAtStartup: z.boolean().nullish(),
  autoStartTracking: z.boolean().nullish(),
  closeBehavior: z.enum(['minimize', 'close']).nullish(),
  minimizeToTray: z.boolean().nullish(),
  breakReminderEnabled: z.boolean().nullish(),
  breakReminderInterval: z.number().nullish(),
  idleThreshold: z.number().nullish(),
  minActivityDuration: z.number().nullish(),
  employeeId: Code.nullish()
});

const SapRequest = z.object({
  startDate: DateText,
  endDate: DateText,
  employeeId: Code.optional(),
  descriptions: z.record(z.string(), z.string().max(500)).optional()
});

const TrackingState = z.looseObject({
  isActive: z.boolean().optional(),
  isTracking: z.boolean().optional(),
  currentActivity: z.unknown().optional()
});

const Meeting = z.looseObject({ id: z.string(), subject: z.string(), startTime: z.string(), endTime: z.string() });
const MeetingInput = z.looseObject({
  id: z.string().max(200),
  subject: z.string().max(200),
  startTime: DateText,
  endTime: DateText,
  duration: z.number().optional(),
  searchText: z.string().max(3000).optional()
});
const CalendarResult = z.looseObject({ success: z.boolean(), error: z.string().optional() });
const ProjectMatch = z.looseObject({ project: z.string().nullish() }).nullable();

const UpdaterReply = z.looseObject({ status: z.string() });
const UpdateChannel = z.string().min(1).max(20);
const UpdaterPreferencesShape = {
  autoCheck: z.boolean().optional(),
  autoDownload: z.boolean().optional(),
  autoInstall: z.boolean().optional(),
  updateChannel: UpdateChannel.optional()
};
const UpdaterPreferences = z.looseObject(UpdaterPreferencesShape);

// ---------- the contract ----------

type Spec = { args: z.ZodTuple; result: z.ZodType; doc: string };
const spec = <A extends z.ZodTuple, R extends z.ZodType>(args: A, result: R, doc: string) => ({ args, result, doc });

export const CONTRACT = {
  // Tracking
  'tracking:start': spec(z.tuple([]), TrackingState, 'Start tracking; no-op when already tracking'),
  'tracking:stop': spec(z.tuple([]), TrackingState, 'Stop tracking; no-op when already stopped'),
  'tracking:toggle': spec(z.tuple([]), TrackingState, 'Toggle tracking'),
  'tracking:get-current': spec(z.tuple([]), TrackingState, 'Current tracking state'),
  'handle-idle-decision': spec(z.tuple([z.boolean()]), z.looseObject({ success: z.boolean(), action: z.string() }),
    'Count (true) or exclude (false) the last idle period'),

  // Activities
  'activities:get': spec(z.tuple([DateText.nullish()]), z.array(Activity), 'Activities for a day (YYYY-MM-DD or ISO), or all'),
  'activities:save-manual': spec(z.tuple([ActivityInput]), Activity, 'Save a manual activity'),
  'activities:update': spec(z.tuple([Id, ActivityInput]), Activity, 'Update an activity'),
  'activities:delete': spec(z.tuple([Id]), z.looseObject({ deleted: z.boolean(), id: Id }), 'Delete an activity'),
  'activities:get-stats': spec(z.tuple([]),
    z.looseObject({ total: z.number(), today: z.number(), totalDuration: z.number(), averageSessionLength: z.number() }),
    'Activity counts and durations'),
  'get-today-total': spec(z.tuple([]), z.number(), "Today's tracked seconds"),
  'get-focus-stats': spec(z.tuple([]), z.looseObject({ totalSessions: z.number(), todaySessions: z.number() }), 'Focus session statistics'),
  'clear-old-activities': spec(z.tuple([z.number().int().min(1).max(3650).optional()]),
    z.looseObject({ success: z.boolean(), cleanedCount: z.number() }), 'Delete activities older than N days (default 30)'),

  // Exports
  'activities:export': spec(z.tuple([]), z.string().nullable(), 'Export all activities to CSV; returns the path, or null when cancelled'),
  'activities:preview-sap': spec(z.tuple([SapRequest]), z.looseObject({ rows: z.array(z.looseObject({})) }), 'SAP CSV preview rows'),
  'activities:export-sap': spec(z.tuple([SapRequest]),
    z.looseObject({ success: z.boolean(), filePath: z.string(), recordCount: z.number() }).nullable(),
    'Write the SAP CSV; null when cancelled'),

  // Settings
  'settings:get-all': spec(z.tuple([]), z.looseObject({}), 'All settings'),
  'settings:save': spec(z.tuple([Settings]), z.looseObject({ success: z.boolean(), errors: z.array(z.string()).optional() }),
    'Merge and save settings'),
  'settings:set-launch-at-startup': spec(z.tuple([z.boolean()]), Success, 'Launch LightTrack at sign-in'),
  'settings:get-launch-at-startup': spec(z.tuple([]), z.looseObject({ enabled: z.boolean() }), 'Whether LightTrack launches at sign-in'),
  'window:update-behavior': spec(z.tuple([z.object({ closeBehavior: z.enum(['minimize', 'close']).optional(), minimizeToTray: z.boolean().optional() })]),
    Success, 'Close and minimise behaviour of the main window'),

  // Mappings
  'get-project-mappings': spec(z.tuple([]), Mappings, 'Window title pattern -> project'),
  'add-project-mapping': spec(z.tuple([Pattern, MappingValue]), Mappings, 'Add or replace a title mapping'),
  'remove-project-mapping': spec(z.tuple([Pattern]), Mappings, 'Remove a title mapping'),
  'get-url-mappings': spec(z.tuple([]), Mappings, 'URL pattern -> project'),
  'add-url-mapping': spec(z.tuple([Pattern, MappingValue]), Mappings, 'Add or replace a URL mapping'),
  'remove-url-mapping': spec(z.tuple([Pattern]), Mappings, 'Remove a URL mapping'),
  'get-jira-mappings': spec(z.tuple([]), Mappings, 'Jira project key -> project'),
  'add-jira-mapping': spec(z.tuple([z.string().min(1).max(20), MappingValue]), Mappings, 'Add or replace a Jira mapping'),
  'remove-jira-mapping': spec(z.tuple([z.string().min(1).max(20)]), Mappings, 'Remove a Jira mapping'),
  'get-meeting-mappings': spec(z.tuple([]), Mappings, 'Meeting subject pattern -> project'),
  'add-meeting-mapping': spec(z.tuple([Pattern, MappingValue]), Mappings, 'Add or replace a meeting mapping'),
  'remove-meeting-mapping': spec(z.tuple([Pattern]), Mappings, 'Remove a meeting mapping'),

  // Salesforce case memory (#48): one case books to one client
  'salesforce:get-case-mappings': spec(z.tuple([]), Mappings, 'Salesforce case number -> project'),
  'salesforce:assign-case': spec(z.tuple([z.string().min(4).max(20), MappingValue]),
    z.looseObject({ mappings: Mappings, updated: z.number() }),
    'Remember the project for a case and move its activities to it'),
  'salesforce:remove-case-mapping': spec(z.tuple([z.string().min(4).max(20)]), Mappings, 'Forget the project for a case'),

  // Tags
  'tags:getAll': spec(z.tuple([]), Groups(z.string()), 'System and custom tags'),
  'tags:getUsed': spec(z.tuple([]), z.array(z.string()), 'Tags used on activities'),
  'tags:add': spec(z.tuple([z.string().min(1).max(50)]), Groups(z.string()).nullable(), 'Add a custom tag'),
  'tags:remove': spec(z.tuple([z.string().min(1).max(50)]), Groups(z.string()), 'Remove a custom tag'),
  'tags:updateActivity': spec(z.tuple([Id, z.array(z.string().max(50)).max(20)]), Activity.nullable(), "Replace an activity's tags"),
  'tags:filterActivities': spec(z.tuple([z.array(z.string().max(50)).max(20), z.boolean().optional()]), z.array(Activity),
    'Activities with any (or all) of the tags'),

  // Projects
  'projects:getAll': spec(z.tuple([]), Groups(Project), 'System and custom projects'),
  'projects:getById': spec(z.tuple([z.string().min(1).max(100)]), Project.nullable(), 'One project'),
  'projects:add': spec(z.tuple([ProjectInput]), Groups(Project), 'Add a custom project'),
  'projects:update': spec(z.tuple([z.string().min(1).max(100), ProjectInput.partial()]), Groups(Project), 'Update a project'),
  'projects:remove': spec(z.tuple([z.string().min(1).max(100)]), Groups(Project), 'Remove a custom project'),

  // Activity types
  'activityTypes:getAll': spec(z.tuple([]), Groups(ActivityType), 'System and custom activity types'),
  'activityTypes:add': spec(z.tuple([z.string().min(2).max(50)]), Groups(ActivityType), 'Add a custom activity type'),
  'activityTypes:remove': spec(z.tuple([z.string().min(1).max(100)]), Groups(ActivityType), 'Remove a custom activity type'),

  // Calendar (ICS subscription)
  'calendar:set-url': spec(z.tuple([z.string().max(2000)]), CalendarResult, 'Set (or clear with "") the ICS URL and sync'),
  'calendar:get-url': spec(z.tuple([]), z.string(), 'Masked ICS URL, or ""'),
  'calendar:sync': spec(z.tuple([]), CalendarResult, 'Sync the calendar now'),
  'calendar:get-meetings': spec(z.tuple([z.object({ includeAllDay: z.boolean().optional() }).optional()]), z.array(Meeting), 'Synced meetings'),
  'calendar:get-today': spec(z.tuple([]), z.array(Meeting), "Today's meetings"),
  'calendar:get-week': spec(z.tuple([]), z.array(Meeting), "This week's meetings"),
  'calendar:get-upcoming': spec(z.tuple([]), z.array(Meeting), 'Meetings in the next 24 hours'),
  'calendar:get-last-sync': spec(z.tuple([]), z.string().nullable(), 'Time of the last sync'),
  'calendar:meeting-to-activity': spec(z.tuple([MeetingInput]), z.looseObject({ title: z.string() }), 'Activity draft for a meeting'),
  'calendar:match-project': spec(z.tuple([MeetingInput]), ProjectMatch, 'Project mapped to a meeting, if any'),

  // Browser extension pairing (LT3-004)
  'browser-extension:get-status': spec(z.tuple([]), z.looseObject({ paired: z.number() }), 'Number of paired extensions'),
  'browser-extension:revoke-all': spec(z.tuple([]), z.looseObject({ paired: z.number() }), 'Disconnect all extensions'),

  // Updates (in-app updates are off; see src/main/update-policy.js)
  'updater-check-for-updates': spec(z.tuple([]), UpdaterReply, 'Check for updates'),
  'updater-download-update': spec(z.tuple([]), UpdaterReply, 'Download an update'),
  'updater-install-update': spec(z.tuple([]), UpdaterReply, 'Install a downloaded update'),
  'updater-get-status': spec(z.tuple([]), z.looseObject({ currentVersion: z.string() }), 'Updater status'),
  'updater-get-preferences': spec(z.tuple([]), UpdaterPreferences, 'Updater preferences'),
  'updater-save-preferences': spec(z.tuple([z.object(UpdaterPreferencesShape)]), UpdaterReply, 'Save updater preferences'),
  'updater-set-channel': spec(z.tuple([UpdateChannel]), UpdaterReply, 'Set the update channel'),
  'updater-skip-version': spec(z.tuple([z.string().min(1).max(50)]), UpdaterReply, 'Skip a version'),

  // Application
  'upgrade:getInfo': spec(z.tuple([]), z.looseObject({ currentVersion: z.string() }).nullable(), 'Installation and upgrade details'),
  'shell:open-external': spec(z.tuple([z.string().max(2000)]), z.void(), 'Open an http(s) URL in the default browser')
} satisfies Record<string, Spec>;

export type Channel = keyof typeof CONTRACT;
export type Args<C extends Channel> = z.infer<(typeof CONTRACT)[C]['args']>;
export type Result<C extends Channel> = z.input<(typeof CONTRACT)[C]['result']>;

export const CHANNELS = Object.keys(CONTRACT) as Channel[];
