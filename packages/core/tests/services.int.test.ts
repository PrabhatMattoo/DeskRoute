import { describe, it, expect } from "vitest";
import {
  createService,
  replaceServices,
  updateService,
  listServices,
  DuplicateServiceName,
} from "../src/repositories/services.js";
import { makeAgent } from "./factories.js";

/**
 * `checkAvailability` offers the catalogue by name, so a name reaching two rows
 * leaves the agent picking a length at random.
 */

const draft = (name: string) => ({
  name,
  price: "$45",
  durationMinutes: 30,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 0,
  requiredResources: [],
});

describe("services_agent_name_idx", () => {
  it("refuses a second service answering to one name", async () => {
    const agent = await makeAgent();
    await createService(agent.id, draft("Haircut"));

    await expect(createService(agent.id, draft("Haircut"))).rejects.toBeInstanceOf(
      DuplicateServiceName,
    );
  });

  it("compares names without regard to case or surrounding space", async () => {
    const agent = await makeAgent();
    await createService(agent.id, draft("Haircut"));

    await expect(createService(agent.id, draft("  haircut  "))).rejects.toBeInstanceOf(
      DuplicateServiceName,
    );
  });

  it("separates a name that another name contains", async () => {
    const agent = await makeAgent();
    await createService(agent.id, draft("Colour"));
    await createService(agent.id, draft("Colour correction"));

    expect((await listServices(agent.id)).map((s) => s.name)).toEqual([
      "Colour",
      "Colour correction",
    ]);
  });

  it("leaves each agent its own catalogue", async () => {
    const [one, two] = [await makeAgent(), await makeAgent()];
    await createService(one.id, draft("Haircut"));

    await expect(createService(two.id, draft("Haircut"))).resolves.toBeDefined();
  });

  it("refuses a rename onto a name already taken", async () => {
    const agent = await makeAgent();
    await createService(agent.id, draft("Haircut"));
    const colour = await createService(agent.id, draft("Colour"));

    await expect(
      updateService(agent.id, colour.id, { name: "Haircut" }),
    ).rejects.toBeInstanceOf(DuplicateServiceName);
  });

  it("names the repeated entry when one list carries it twice", async () => {
    const agent = await makeAgent();

    await expect(
      replaceServices(agent.id, [draft("Haircut"), draft("haircut")]),
    ).rejects.toBeInstanceOf(DuplicateServiceName);
  });
});
