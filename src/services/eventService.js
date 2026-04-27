const Event = require("../models/Event");

/**
 * Returns the combined multiplier for a given earning type at the current moment.
 * If multiple events are active, multipliers stack multiplicatively (capped at 5×).
 */
const getActiveMultiplier = async (type) => {
  const now = new Date();
  const events = await Event.find({
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
  }).lean();

  if (!events.length) return { multiplier: 1, eventIds: [] };

  let multiplier = 1;
  const eventIds = [];

  for (const evt of events) {
    // Empty applicableTypes = applies to all earning types
    if (evt.applicableTypes.length === 0 || evt.applicableTypes.includes(type)) {
      multiplier *= evt.multiplier;
      eventIds.push(evt._id);
    }
  }

  return { multiplier: Math.min(multiplier, 5), eventIds };
};

const getActiveEvents = async () => {
  const now = new Date();
  return Event.find({
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
  }).sort({ startDate: 1 }).lean();
};

const getAllEvents = async () => {
  return Event.find().sort({ startDate: -1 }).lean();
};

const createEvent = async (data, adminId) => {
  if (new Date(data.endDate) <= new Date(data.startDate)) {
    throw new Error("La date de fin doit être après la date de début");
  }
  return Event.create({ ...data, createdBy: adminId });
};

const updateEvent = async (id, patch) => {
  const evt = await Event.findByIdAndUpdate(id, patch, { new: true, runValidators: true });
  if (!evt) throw new Error("Événement introuvable");
  return evt;
};

const deleteEvent = async (id) => {
  const evt = await Event.findByIdAndDelete(id);
  if (!evt) throw new Error("Événement introuvable");
  return evt;
};

module.exports = {
  getActiveMultiplier,
  getActiveEvents,
  getAllEvents,
  createEvent,
  updateEvent,
  deleteEvent,
};
