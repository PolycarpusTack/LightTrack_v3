// calendarHandlerMain.js - Calendar Sync IPC Handler
// Handles ICS calendar subscription sync

const logger = require('../../logger');

/**
 * Calendar Handler for main.js
 * Registers all calendar-related IPC handlers
 */
class CalendarHandlerMain {
  constructor(calendarSyncService) {
    this.calendarService = calendarSyncService;
  }

  /**
   * Register all calendar IPC handlers
   */
  registerHandlers(registry) {
    logger.debug('Registering Calendar IPC handlers...');

    // Set calendar URL
    registry.handle('calendar:set-url', async (event, url) => {
      try {
        return await this.calendarService.setCalendarUrl(url);
      } catch (error) {
        logger.error('Failed to set calendar URL:', error);
        return { success: false, error: error.message };
      }
    });

    // Get calendar URL
    registry.handle('calendar:get-url', () => {
      return this.calendarService.getCalendarUrl();
    });

    // Sync calendar now
    registry.handle('calendar:sync', async () => {
      try {
        return await this.calendarService.syncCalendar();
      } catch (error) {
        logger.error('Failed to sync calendar:', error);
        return { success: false, error: error.message };
      }
    });

    // Get all meetings
    registry.handle('calendar:get-meetings', (event, options = {}) => {
      return this.calendarService.getMeetings(options);
    });

    // Get today's meetings
    registry.handle('calendar:get-today', () => {
      return this.calendarService.getTodaysMeetings();
    });

    // Get this week's meetings
    registry.handle('calendar:get-week', () => {
      return this.calendarService.getThisWeeksMeetings();
    });

    // Get upcoming meetings (next 24 hours)
    registry.handle('calendar:get-upcoming', () => {
      return this.calendarService.getUpcomingMeetings();
    });

    // Get last sync time
    registry.handle('calendar:get-last-sync', () => {
      return this.calendarService.getLastSyncTime();
    });

    // Convert meeting to activity (for creating time entry)
    registry.handle('calendar:meeting-to-activity', (event, meeting) => {
      return this.calendarService.meetingToActivity(meeting);
    });

    // Match meeting to project
    registry.handle('calendar:match-project', (event, meeting) => {
      return this.calendarService.matchMeetingToProject(meeting);
    });

    logger.debug('Calendar IPC handlers registered successfully');
  }
}

module.exports = CalendarHandlerMain;
