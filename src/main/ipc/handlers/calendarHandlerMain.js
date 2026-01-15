// calendarHandlerMain.js - Calendar Sync IPC Handler
// Handles ICS calendar subscription sync

const { ipcMain } = require('electron');
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
  registerHandlers() {
    logger.debug('Registering Calendar IPC handlers...');

    // Set calendar URL
    ipcMain.handle('calendar:set-url', async (event, url) => {
      try {
        return await this.calendarService.setCalendarUrl(url);
      } catch (error) {
        logger.error('Failed to set calendar URL:', error);
        return { success: false, error: error.message };
      }
    });

    // Get calendar URL
    ipcMain.handle('calendar:get-url', () => {
      return this.calendarService.getCalendarUrl();
    });

    // Sync calendar now
    ipcMain.handle('calendar:sync', async () => {
      try {
        return await this.calendarService.syncCalendar();
      } catch (error) {
        logger.error('Failed to sync calendar:', error);
        return { success: false, error: error.message };
      }
    });

    // Get all meetings
    ipcMain.handle('calendar:get-meetings', (event, options = {}) => {
      return this.calendarService.getMeetings(options);
    });

    // Get today's meetings
    ipcMain.handle('calendar:get-today', () => {
      return this.calendarService.getTodaysMeetings();
    });

    // Get this week's meetings
    ipcMain.handle('calendar:get-week', () => {
      return this.calendarService.getThisWeeksMeetings();
    });

    // Get upcoming meetings (next 24 hours)
    ipcMain.handle('calendar:get-upcoming', () => {
      return this.calendarService.getUpcomingMeetings();
    });

    // Get last sync time
    ipcMain.handle('calendar:get-last-sync', () => {
      return this.calendarService.getLastSyncTime();
    });

    // Convert meeting to activity (for creating time entry)
    ipcMain.handle('calendar:meeting-to-activity', (event, meeting) => {
      return this.calendarService.meetingToActivity(meeting);
    });

    // Match meeting to project
    ipcMain.handle('calendar:match-project', (event, meeting) => {
      return this.calendarService.matchMeetingToProject(meeting);
    });

    logger.debug('Calendar IPC handlers registered successfully');
  }
}

module.exports = CalendarHandlerMain;
