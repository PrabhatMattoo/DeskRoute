import { Hono } from "hono";
import type { AppEnv } from "../../types.js";
import { periodStart } from "@receptionist/core/domain/business-hours.js";
import {
  countAfterHoursCalls,
  countCalls,
  countAbandonedCalls,
  countConfirmedBookings,
  countPendingEscalations,
  getHoursAndZone,
} from "@receptionist/core/repositories/metrics.js";
import { metricsQuerySchema } from "../../schemas.js";
import { query } from "../../validate.js";

export const metrics = new Hono<AppEnv>().get(
  "/",
  query(metricsQuerySchema),
  async (c) => {
    const agentId = c.get("agentId");
    const since = periodStart(c.req.valid("query").period);

    const [totalCalls, confirmedBookings, pendingEscalations, abandonedCalls, agent] =
      await Promise.all([
        countCalls(agentId, since),
        countConfirmedBookings(agentId, since),
        countPendingEscalations(agentId),
        countAbandonedCalls(agentId, since),
        getHoursAndZone(agentId),
      ]);

    const afterHoursCalls = agent
      ? await countAfterHoursCalls(agentId, since, agent.businessHours, agent.timezone)
      : 0;

    return c.json({
      totalCalls,
      afterHoursCalls,
      confirmedBookings,
      pendingEscalations,
      abandonedCalls,
    });
  },
);
