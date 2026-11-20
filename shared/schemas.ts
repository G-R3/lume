import { z } from "zod";

export const databaseIdSchema = z.number("Invalid database ID").int().positive().safe();

export const databaseIdsSchema = z.array(databaseIdSchema, "Invalid database IDs");

export const playbackPositionSchema = z.number().finite().nonnegative();

export const playlistDuplicatesSchema = z.enum(["allow", "skip", "reject"]);

export const setTracksLikedInputSchema = z.object({
  liked: z.boolean("Invalid track like input"),
  trackIds: databaseIdsSchema.min(1).readonly(),
});
