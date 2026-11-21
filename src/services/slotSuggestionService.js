const bookingService = require('./bookingService');
const { createGeminiClient } = require('./geminiClient');

const supportedActivities = new Set(['web_cloud', 'networking']);
const fallbackMessage = 'Gemini could not provide a valid suggestion; showing the first matching available slot instead.';
const fallbackReason = 'First available slot matching your selected activity.';

async function suggestSlot(database, userId, input, now = new Date(), geminiClient = createGeminiClient()) {
  await bookingService.ensureStudent(database, userId);
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || !supportedActivities.has(input.activityType)) {
    throw new bookingService.BookingError(422, 'Choose a supported activity: web_cloud or networking.');
  }

  const availableSlots = (await bookingService.listAvailableSlots(database, userId, input.date, now))
    .filter((slot) => slot.activityType === input.activityType);
  if (availableSlots.length === 0) {
    return { suggestion: null, message: 'No matching workstation is available for this activity and date.' };
  }

  let modelSuggestion;
  let usedFallback = false;
  try {
    if (!geminiClient.isConfigured()) throw new Error('Gemini is not configured.');
    const modelSlots = availableSlots.map((slot) => ({
      slotId: `${slot.workstationId}:${slot.startsAt}`,
      workstationName: slot.workstationName,
      workstationDescription: slot.workstationDescription,
      labName: slot.labName,
      labLocation: slot.labLocation,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
    }));
    modelSuggestion = await geminiClient.suggestSlot({
      activityType: input.activityType,
      date: input.date,
      slots: modelSlots,
    });
  } catch {
    usedFallback = true;
  }

  const matchedSlot = !usedFallback && modelSuggestion
    ? availableSlots.find((slot) => `${slot.workstationId}:${slot.startsAt}` === modelSuggestion.slotId)
    : null;
  const reason = typeof modelSuggestion?.reason === 'string'
    ? modelSuggestion.reason.trim()
    : '';
  if (!matchedSlot || reason.length === 0 || reason.length > 300) usedFallback = true;

  const slot = usedFallback ? availableSlots[0] : matchedSlot;
  return {
    suggestion: {
      slot,
      reason: usedFallback ? fallbackReason : reason,
    },
    fallbackMessage: usedFallback ? fallbackMessage : null,
  };
}

module.exports = { fallbackMessage, suggestSlot };
