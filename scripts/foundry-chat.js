import { getFoundryMessageMode, normalizeVisibilityMode } from './dice-formula.js';

export async function postFoundryChat(data, visibility, roll) {
  const ChatMessage = CONFIG.ChatMessage.documentClass;
  const generation = game.release.generation;
  const mode = getFoundryMessageMode(visibility, generation);
  const messageOptions = generation >= 14 ? { messageMode: mode } : { rollMode: mode };

  let messageData = { ...data, speaker: data.speaker ?? ChatMessage.getSpeaker() };
  if (roll) {
    messageData = await roll.toMessage(messageData, { ...messageOptions, create: false });
  } else {
    messageData =
      generation >= 14 ? ChatMessage.applyMode(messageData, mode) : ChatMessage.applyRollMode(messageData, mode);
  }

  // An empty whisper list is public in Foundry.
  if (normalizeVisibilityMode(visibility) !== 'public' && !messageData.whisper?.length) {
    throw new Error('NoWhisperRecipients');
  }
  return ChatMessage.create(messageData);
}
