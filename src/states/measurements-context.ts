import { createContext } from "react";
import type { SpecimenResult } from "@/states/measure";

/** The latest measurement of every specimen on the states page, by specimen id. */
export const MeasurementsContext = createContext<ReadonlyMap<string, SpecimenResult>>(new Map());
