import { llm } from "@livekit/agents";
import { z } from "zod";
import type { AgentDeps } from "./deps.js";
import { createEscalation } from "@receptionist/core/repositories/escalations.js";
import { setCallerName } from "@receptionist/core/repositories/callers.js";
import {
  fetchBusyRanges,
  createCalendarEvent,
  deleteCalendarEvent,
} from "@receptionist/core/providers/calendar.js";
import {
  describeAppointmentWindow,
  describeDate,
  describeSlot,
  filterByBusy,
  serviceByName,
  generateCandidateSlots,
  isOpenOn,
} from "@receptionist/core/domain/scheduling.js";
import {
  createAppointment,
  attachExternalEvent,
  releaseToRequested,
  getUpcomingByPhone,
  cancelAppointmentById,
  SlotTaken,
} from "@receptionist/core/repositories/appointments.js";

/** How many times the agent reads out at once. More than three is unfollowable. */
const MAX_SLOTS_OFFERED = 3;

/** How far ahead to search when the caller did not name a day. */
const DEFAULT_SEARCH_DAYS = 14;

export function createAgentTools(deps: AgentDeps) {
  const agentId = deps.agent.id;
  const timeZone = deps.agent.timezone;

  /**
   * A name given now beats one already stored, because people correct themselves.
   * Remembering it needs a caller row, which an anonymous caller does not have.
   */
  async function resolveCallerName(spoken: string | null): Promise<string | null> {
    const given = spoken?.trim() || null;

    if (given && deps.caller) {
      const updated = await setCallerName(agentId, deps.caller.id, given);
      if (updated) deps.caller = updated;
    }

    return given ?? deps.caller?.name ?? null;
  }

  const conversation = {
    createEscalation: llm.tool({
      description:
        "Records one question for the business owner to answer after the call ends. " +
        "Use it for a question the services, hours and knowledge above leave unanswered, and for a request this agent has no way to carry out. " +
        "The tool writes the question down and returns; speaking to the caller stays with the agent, so say the fallback line and take the caller's name first. " +
        "Records at most one entry per question per call.",
      parameters: z.object({
        question: z.string().describe("The caller's question, in the words they used."),
        callerName: z
          .string()
          .nullable()
          .describe(
            "The name of the person to ring back, for example Dana. Null when the caller was asked and declined.",
          ),
        transcriptExcerpt: z
          .string()
          .nullable()
          .describe(
            "Up to two sentences of surrounding conversation. Null when the question stands on its own.",
          ),
      }),
      execute: async ({ question, callerName, transcriptExcerpt }, { ctx }) => {
        ctx.speechHandle.allowInterruptions = false;
        // `escalations.call_id` is a foreign key to a row written after the
        // greeting, so this waits rather than moving the insert onto the call path.
        const callRowExists = await deps.callRowReady;
        await createEscalation({
          agentId,
          // Unlinked rather than lost: without the row, the FK would reject the
          // insert and the tool would throw mid-call.
          callId: callRowExists ? deps.callId : null,
          callerId: deps.caller?.id ?? null,
          callerPhone: deps.callerPhone,
          callerName: await resolveCallerName(callerName),
          question,
          transcriptExcerpt,
        });
        deps.callState.wasEscalated = true;
        return { escalated: true };
      },
    }),

    rememberCallerName: llm.tool({
      description:
        "Stores a name the caller offered in conversation, so a later call greets them by it. " +
        "Use it for a name the caller said of their own accord. " +
        "Booking takes its own name, so a booking needs no call here. " +
        "Stores at most one name per call.",
      parameters: z.object({
        name: z
          .string()
          .describe(
            "The caller's name as spoken, for example Dana. A first name on its own is enough.",
          ),
      }),
      execute: async ({ name }) => {
        // An anonymous caller has no row to attach a name to.
        if (!deps.caller) return { saved: false };

        const updated = await setCallerName(agentId, deps.caller.id, name);
        if (!updated) return { saved: false };

        // Keep in-memory deps in step so the rest of this call uses the name.
        deps.caller = updated;
        return { saved: true };
      },
    }),

    lookupAppointments: llm.tool({
      description:
        "Returns the caller's upcoming appointments, found by the number they are calling from. " +
        "Use it when the caller asks about a booking they already hold. " +
        "Returns an empty list and a message when the number is withheld or no booking stands.",
      parameters: z.object({}),
      execute: async () => {
        // A shared placeholder key would read one caller's appointments to another.
        if (!deps.callerPhone) {
          return {
            appointments: [],
            message:
              "This caller's number is withheld, so their bookings cannot be looked up. " +
              "Ask the caller which number the appointment was booked under.",
          };
        }
        const upcoming = await getUpcomingByPhone(agentId, deps.callerPhone);
        if (upcoming.length === 0) {
          return {
            appointments: [],
            message: "This number holds no upcoming appointments.",
          };
        }
        return {
          appointments: upcoming.map((a) => ({
            id: a.id,
            service: a.service,
            startTime: a.startTime?.toISOString() ?? null,
            endTime: a.endTime?.toISOString() ?? null,
            status: a.status,
          })),
        };
      },
    }),

    cancelAppointment: llm.tool({
      description:
        "Cancels one appointment and removes its calendar entry. " +
        "Call it once the appointment details have been read back to the caller and the caller has confirmed the cancellation. " +
        "Returns an error when the id names no appointment for this business.",
      parameters: z.object({
        appointmentId: z
          .string()
          .describe("The id of the appointment, copied from lookupAppointments."),
      }),
      execute: async ({ appointmentId }) => {
        const cancelled = await cancelAppointmentById(appointmentId, agentId);
        if (!cancelled) {
          return {
            error:
              "That id matches no appointment for this business. Call lookupAppointments and read the caller what it returns.",
          };
        }

        if (cancelled.externalEventId && deps.calendarExternalId) {
          const token = await deps.getGoogleToken();
          if (token) {
            try {
              await deleteCalendarEvent(
                token,
                deps.calendarExternalId,
                cancelled.externalEventId,
              );
            } catch (err) {
              console.error("[agent] deleteCalendarEvent failed:", err);
            }
          }
        }

        return { cancelled: true, appointmentId };
      },
    }),

    endCall: llm.tool({
      description:
        "Speaks the farewell and hangs up. " +
        "Call it once the caller has said they are finished, for example 'goodbye', 'thanks, that's all' or 'that's everything'.",
      parameters: z.object({}),
      execute: async (_params, { ctx }) => {
        const farewell = deps.agent.farewell;
        if (farewell) {
          ctx.session.say(farewell, { allowInterruptions: false });
        }
        ctx.session.shutdown({ drain: true });
      },
    }),
  };

  const [firstName, ...otherNames] = deps.services.map((s) => s.name);

  // A business with no services has nothing to offer a time for, and a tool the
  // model never receives is a tool it cannot reach for.
  if (firstName === undefined) return conversation;

  const catalogue = deps.services.map((s) => s.name).join(", ");

  return {
    ...conversation,

    checkAvailability: llm.tool({
      description:
        "Returns up to three bookable times for one service, each with a slot id. " +
        "Call it before naming any time to the caller, so every time spoken is one the business can keep. " +
        "Read the times aloud in plain words and hold each slot id for bookAppointment. " +
        "Returns an empty slot list and a note when the window holds nothing.",
      parameters: z.object({
        service: z
          .enum([firstName, ...otherNames])
          .describe("The service to find times for, chosen from this business's list."),
        preferredDate: z
          .string()
          .nullable()
          .describe(
            "The date the caller asked for, as YYYY-MM-DD, for example 2026-09-24. Null when the caller named no date.",
          ),
        partOfDay: z
          .enum(["morning", "afternoon", "evening"])
          .nullable()
          .describe(
            "The part of day the caller asked for. Null when the caller named none.",
          ),
      }),
      execute: async ({ service, preferredDate, partOfDay }) => {
        const calendarId = deps.calendarExternalId;
        if (!calendarId) {
          return {
            error:
              "This business has no calendar connected, so no time can be offered. Tell the caller the team will call back, then call createEscalation with their request.",
          };
        }

        const matched = serviceByName(deps.services, service);
        if (!matched) {
          // A provider that leaves the enum unenforced can return a name the
          // catalogue never held, and a guess here books the wrong length.
          return {
            error: `"${service}" is not one of this business's services. Tell the caller what it does offer, from: ${catalogue}. Then ask which one they want.`,
          };
        }

        const token = await deps.getGoogleToken();
        if (!token) {
          return {
            error:
              "The calendar connection is not usable, so no time can be offered. Tell the caller the team will call back, then call createEscalation with their request.",
          };
        }

        const now = new Date();
        const hours = deps.agent.businessHours;
        const policy = {
          minNoticeMinutes: deps.agent.minNoticeMinutes,
          maxAdvanceDays: deps.agent.maxAdvanceDays,
        };

        // A closed day still wants an appointment, so the search carries forward.
        const closedNote =
          preferredDate && !isOpenOn(hours, preferredDate)
            ? `This business is closed on ${describeDate(preferredDate, timeZone)}. Say so, then offer the times below.`
            : undefined;

        const candidates = generateCandidateSlots({
          hours,
          policy,
          service: matched,
          timeZone,
          now,
          fromDate: preferredDate ?? undefined,
          days: preferredDate && !closedNote ? 0 : DEFAULT_SEARCH_DAYS,
          partOfDay,
        });

        if (candidates.length === 0) {
          return {
            slots: [],
            note: `This business opens no ${matched.name} time${
              preferredDate ? ` around ${describeDate(preferredDate, timeZone)}` : ""
            }. Offer a callback, or ask the caller for another day.`,
          };
        }

        let free = candidates;
        try {
          const busy = await fetchBusyRanges(
            token,
            calendarId,
            candidates[0]!.blockStart.toISOString(),
            candidates.at(-1)!.blockEnd.toISOString(),
          );
          free = filterByBusy(candidates, busy);
        } catch (err) {
          console.error("[agent] freeBusy lookup failed:", err);
          return {
            error:
              "The calendar could not be read, so no time can be offered. Tell the caller the team will call back, then call createEscalation with their request.",
          };
        }

        if (free.length === 0) {
          return {
            slots: [],
            note: "Every time in that window is booked. Ask the caller for another day.",
          };
        }

        const offered = free.slice(0, MAX_SLOTS_OFFERED).map((slot) => {
          const slotId = `slot_${deps.slots.nextId++}`;
          deps.slots.held.set(slotId, { slot, service: matched });
          return { slotId, time: describeSlot(slot, timeZone) };
        });

        return {
          service: matched.name,
          slots: offered,
          ...(closedNote ? { note: closedNote } : {}),
        };
      },
    }),

    bookAppointment: llm.tool({
      description:
        "Confirms a booking for a slot checkAvailability returned during this call. " +
        "Call it once the caller has chosen one of the times read to them and their name is known; ask 'Can I take your name?' when it is not. " +
        "Books only a slot id from this call, and returns an error when that slot has since been taken.",
      parameters: z.object({
        slotId: z
          .string()
          .describe(
            "The slot id the caller chose, copied from checkAvailability, for example slot_1.",
          ),
        callerName: z
          .string()
          .nullable()
          .describe(
            "The name the diary entry carries, for example Dana. Null when the caller was asked and declined.",
          ),
      }),
      execute: async ({ slotId, callerName }) => {
        const held = deps.slots.held.get(slotId);
        if (!held) {
          return {
            error:
              "That slot id belongs to no time offered in this call. Call checkAvailability again and read the caller the times it returns.",
          };
        }

        const { slot, service } = held;
        const token = await deps.getGoogleToken();
        const bookedName = await resolveCallerName(callerName);

        const appointmentBase = {
          agentId,
          callerId: deps.caller?.id ?? null,
          callerPhone: deps.callerPhone,
          callerName: bookedName,
          serviceId: service.id,
          serviceName: service.name,
          startTime: slot.start,
          endTime: slot.end,
        };

        if (!token || !deps.calendarExternalId) {
          await createAppointment({
            ...appointmentBase,
            status: "requested",
          });
          deps.callState.wasBooked = true;
          return {
            booked: false,
            reason:
              "The request is saved and the team will confirm it. Tell the caller the time is held pending confirmation.",
          };
        }

        const taken = {
          error:
            "Another caller took that time during this call. Call checkAvailability again and read the caller the times it returns.",
        };

        // The slot was computed while the caller was deciding, so it is
        // re-checked immediately before the write.
        let busy;
        try {
          busy = await fetchBusyRanges(
            token,
            deps.calendarExternalId,
            slot.blockStart.toISOString(),
            slot.blockEnd.toISOString(),
          );
        } catch (err) {
          console.error("[agent] freeBusy re-check failed:", err);
          await createAppointment({ ...appointmentBase, status: "requested" });
          deps.callState.wasBooked = true;
          return {
            booked: false,
            reason:
              "The request is saved and the team will confirm it. Tell the caller the time is held pending confirmation.",
          };
        }

        if (filterByBusy([slot], busy).length === 0) {
          deps.slots.held.delete(slotId);
          return taken;
        }

        // `appointments_no_overlap` serialises two callers booking one slot at
        // once, so the row is claimed before the calendar event is written.
        let appointment;
        try {
          appointment = await createAppointment({
            ...appointmentBase,
            blockStart: slot.blockStart,
            blockEnd: slot.blockEnd,
            status: "confirmed",
          });
        } catch (err) {
          if (err instanceof SlotTaken) {
            deps.slots.held.delete(slotId);
            return taken;
          }
          console.error("[agent] createAppointment failed:", err);
          return {
            error:
              "The booking could not be saved. Tell the caller the team will call back, then call createEscalation with their request.",
          };
        }

        try {
          const padded =
            service.bufferBeforeMinutes > 0 || service.bufferAfterMinutes > 0
              ? ` (appointment ${describeSlot(slot, timeZone)}; includes setup and cleanup)`
              : "";

          const eventId = await createCalendarEvent(token, deps.calendarExternalId, {
            // The title leads with the appointment window: the event spans the
            // padded block and Google renders it in the viewer's timezone.
            summary: `${service.name} ${describeAppointmentWindow(slot, timeZone)} — ${
              bookedName ?? deps.callerPhone ?? "name not given"
            }`,
            // The block, not the appointment: the event must reserve setup and
            // cleanup or the next booking lands on top of them.
            startIso: slot.blockStart.toISOString(),
            endIso: slot.blockEnd.toISOString(),
            timezone: timeZone,
            description: `Booked by the AI receptionist${padded}`,
          });
          await attachExternalEvent(appointment.id, eventId);
        } catch (err) {
          console.error("[agent] createCalendarEvent failed:", err);
          await releaseToRequested(appointment.id);
          deps.callState.wasBooked = true;
          return {
            booked: false,
            reason:
              "The request is saved and the team will confirm it. Tell the caller the time is held pending confirmation.",
          };
        }

        deps.callState.wasBooked = true;
        deps.slots.held.delete(slotId);
        return { booked: true, time: describeSlot(slot, timeZone) };
      },
    }),
  };
}
