import type { CharacterType, Persona } from "../types";
import type { DemoMonth } from "./build";
import { buildFirstJob } from "./first-job";
import { buildProfessional } from "./professional";
import { buildStudent } from "./student";

export { DEMO_MONTHS, type DemoMonth } from "./build";

const BUILDERS: Record<CharacterType, (city: string, month: DemoMonth) => Persona> = {
  student: buildStudent,
  "first-job": buildFirstJob,
  professional: buildProfessional,
};

/** The sample month for a twin: shaped by their life stage, their city, and which month it is. */
export function getPersona(type: CharacterType, city: string, month: DemoMonth = 8): Persona {
  return BUILDERS[type](city, month);
}
