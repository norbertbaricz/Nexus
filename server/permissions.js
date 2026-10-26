'use strict';

// Basic permissions start enabled; administrative permissions require a role.
// Deny wins over role grants. The owner always retains control of the server.
const PERMISSION_DEFINITIONS = Object.freeze([
  ['viewChannels', 'View channels', 'Access', true, 'Open channels that pass their private-role access rules.'],
  ['sendMessages', 'Send messages', 'Messages', true, 'Post in writable text channels and collections.'],
  ['attachFiles', 'Attach files and GIFs', 'Messages', true, 'Add uploads, topic covers and provider GIFs.'],
  ['downloadFiles', 'Download files', 'Messages', true, 'Download permitted files; image downloads remain limited to DMs and media galleries.'],
  ['addReactions', 'Add reactions', 'Messages', true, 'React to messages and replies.'],
  ['pinMessages', 'Pin messages', 'Messages', false, 'Pin and unpin messages in this server.'],
  ['mentionEveryone', 'Mention everyone', 'Messages', false, 'Notify every eligible member in the current server channel.'],
  ['manageMessages', 'Manage messages', 'Messages', false, 'Moderate messages and bypass read-only and slowmode restrictions. Includes pin and topic management.'],
  ['createTopics', 'Create forum posts', 'Forum', true, 'Start a forum post with text and attachments.'],
  ['replyToTopics', 'Reply to forum posts', 'Forum', true, 'Write replies inside forum conversations.'],
  ['manageTopics', 'Manage forum posts', 'Forum', false, 'Remove forum posts or replies.'],
  ['connectVoice', 'Connect to voice', 'Voice', true, 'Join voice rooms and stages.'],
  ['speak', 'Use microphone', 'Voice', true, 'Transmit microphone audio; stage audiences remain listeners.'],
  ['useVideo', 'Use camera', 'Voice', true, 'Share camera video where channel media is enabled.'],
  ['shareScreen', 'Share screen', 'Voice', true, 'Share a screen where channel media is enabled.'],
  ['inviteMembers', 'Invite members', 'Community', false, 'Read and share the current server invitation.'],
  ['manageInvites', 'Replace invitations', 'Community', false, 'Rotate the invitation and invalidate its previous code.'],
  ['kickMembers', 'Kick members', 'Moderation', false, 'Remove members without banning them.'],
  ['banMembers', 'Ban members', 'Moderation', false, 'Apply and revoke timed or permanent bans.'],
  ['timeoutMembers', 'Temporarily mute members', 'Moderation', false, 'Apply and revoke server timeouts.'],
  ['disconnectMembers', 'Disconnect members from voice', 'Moderation', false, 'Remove a member from their current voice room or stage.'],
  ['moderateMembers', 'Manage all member moderation', 'Moderation', false, 'Includes kick, ban and timeout permissions.'],
  ['manageChannels', 'Manage channels and categories', 'Administration', false, 'Create, edit, reorder and remove channels, covers and categories.'],
  ['manageRoles', 'Manage roles', 'Administration', false, 'Manage permitted lower roles without granting permissions you do not hold.'],
  ['viewAuditLog', 'View activity log', 'Administration', false, 'Read server administrative activity.'],
  ['manageServer', 'Manage server settings', 'Administration', false, 'Change server details, images, rules and basic permission defaults.'],
].map(([key, label, group, defaultEnabled, description]) => Object.freeze({ key, label, group, defaultEnabled, description })));
const PERMISSION_KEYS = new Set(PERMISSION_DEFINITIONS.map(item => item.key));
const BASIC_PERMISSION_KEYS = new Set(PERMISSION_DEFINITIONS.filter(item => item.defaultEnabled).map(item => item.key));
const IMPLIED_PERMISSIONS = Object.freeze({ manageMessages: ['pinMessages', 'manageTopics'], moderateMembers: ['kickMembers', 'banMembers', 'timeoutMembers', 'disconnectMembers'], manageServer: ['viewAuditLog'] });
const PROTECTED_ROLE_PERMISSIONS = new Set(['manageServer','manageRoles','manageChannels','moderateMembers','kickMembers','banMembers','timeoutMembers','disconnectMembers']);

function resolvePermissions(defaults = {}, roles = [], owner = false) {
  const result = Object.fromEntries(PERMISSION_DEFINITIONS.map(item => [item.key, owner || (BASIC_PERMISSION_KEYS.has(item.key) && (defaults[item.key] ?? item.defaultEnabled))]));
  if (owner) return result;
  for (const role of roles) for (const key of role.permissions || []) if (PERMISSION_KEYS.has(key)) result[key] = true;
  for (const role of roles) for (const key of role.deniedPermissions || []) if (PERMISSION_KEYS.has(key)) result[key] = false;
  for (const [key, implied] of Object.entries(IMPLIED_PERMISSIONS)) if (result[key]) for (const permission of implied) result[permission] = true;
  for (const role of roles) for (const key of role.deniedPermissions || []) if (PERMISSION_KEYS.has(key)) result[key] = false;
  return result;
}

function normalizeDefaults(value) {
  if (!value || Array.isArray(value) || typeof value !== 'object' || Object.entries(value).some(([key, enabled]) => !BASIC_PERMISSION_KEYS.has(key) || typeof enabled !== 'boolean')) throw new Error('Choose valid basic server permissions.');
  return Object.fromEntries(Object.entries(value));
}

module.exports = { PERMISSION_DEFINITIONS, PERMISSION_KEYS, BASIC_PERMISSION_KEYS, PROTECTED_ROLE_PERMISSIONS, resolvePermissions, normalizeDefaults };
