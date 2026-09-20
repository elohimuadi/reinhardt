import posthog from 'posthog-js';
export function enableAnalytics(consentGranted) {
  if (consentGranted) posthog.init('public-project-id', {autocapture: false, disable_session_recording: true});
}
document.querySelector('#preferences').addEventListener('click', showPreferences);
