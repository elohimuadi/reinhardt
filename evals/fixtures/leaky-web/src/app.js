import posthog from 'posthog-js';
posthog.init('public-project-id');
const pixel = document.createElement('script');
pixel.src = 'https://connect.facebook.net/en_US/fbevents.js';
document.head.appendChild(pixel);
fetch('https://api.anthropic.com/v1/messages', {method: 'POST', body: JSON.stringify({messages: userMessages})});
