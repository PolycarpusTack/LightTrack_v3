// Content script for LightTrack Browser Extension
// Scoped, throttled detection for work-related pages

(function () {
  'use strict';

  // Only run on known work-related domains to reduce overhead and privacy concerns
  const SUPPORTED_DOMAINS = [
    'atlassian.net',     // JIRA Cloud
    'jira.',             // JIRA Server
    'github.com',
    'gitlab.com',
    'bitbucket.org',
    'azure.devops.com',
    'dev.azure.com'
  ];

  const hostname = window.location.hostname;
  const isWorkDomain = SUPPORTED_DOMAINS.some(d => hostname.includes(d));

  // Skip scanning on non-work domains
  if (!isWorkDomain) {
    return;
  }

  // Throttle: only send context once per page load
  let contextSent = false;

  function sendContextOnce(data) {
    if (contextSent) return;
    contextSent = true;

    chrome.runtime.sendMessage({
      action: 'pageContext',
      data: {
        ...data,
        url: window.location.href,
        title: document.title
      }
    });
  }

  // JIRA detection - use URL and page elements, not full body scan
  if (hostname.includes('atlassian.net') || hostname.includes('jira')) {
    // JIRA Cloud/Server - get ticket from URL or breadcrumb
    const jiraTicketFromUrl = window.location.pathname.match(/\/browse\/([A-Z]+-\d+)/i);
    const jiraTicketFromSearch = window.location.search.match(/selectedIssue=([A-Z]+-\d+)/i);

    const ticket = jiraTicketFromUrl?.[1] || jiraTicketFromSearch?.[1];

    if (ticket) {
      sendContextOnce({
        tickets: [ticket.toUpperCase()]
      });
    } else {
      // Fallback: scan only the visible issue keys in specific elements
      const issueKeyElement = document.querySelector('[data-testid="issue.views.issue-base.foundation.breadcrumbs.breadcrumb-current-issue-container"]') ||
                             document.querySelector('.issue-link') ||
                             document.querySelector('[data-issue-key]');

      if (issueKeyElement) {
        const key = issueKeyElement.dataset?.issueKey ||
                   issueKeyElement.textContent?.match(/[A-Z]+-\d+/)?.[0];
        if (key) {
          sendContextOnce({
            tickets: [key.toUpperCase()]
          });
        }
      }
    }
  }

  // GitHub detection - use URL structure
  if (hostname === 'github.com') {
    const pathParts = window.location.pathname.split('/');

    // /owner/repo/issues/123 or /owner/repo/pull/123
    if (pathParts.length >= 5 && (pathParts[3] === 'issues' || pathParts[3] === 'pull')) {
      sendContextOnce({
        githubIssue: `#${pathParts[4]}`,
        githubRepo: `${pathParts[1]}/${pathParts[2]}`,
        githubType: pathParts[3]
      });
    } else if (pathParts.length >= 3) {
      // Just on a repo page
      sendContextOnce({
        githubRepo: `${pathParts[1]}/${pathParts[2]}`
      });
    }
  }

  // GitLab detection
  if (hostname.includes('gitlab')) {
    const issueMatch = window.location.pathname.match(/\/-\/issues\/(\d+)/);
    const mrMatch = window.location.pathname.match(/\/-\/merge_requests\/(\d+)/);

    if (issueMatch) {
      sendContextOnce({
        gitlabIssue: `#${issueMatch[1]}`
      });
    } else if (mrMatch) {
      sendContextOnce({
        gitlabMR: `!${mrMatch[1]}`
      });
    }
  }

  // Azure DevOps detection
  if (hostname.includes('dev.azure.com') || hostname.includes('azure.devops')) {
    const workItemMatch = window.location.pathname.match(/workitems\/edit\/(\d+)/i) ||
                         window.location.search.match(/workitem=(\d+)/i);

    if (workItemMatch) {
      sendContextOnce({
        azureWorkItem: workItemMatch[1]
      });
    }
  }
})();
