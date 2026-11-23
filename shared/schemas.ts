import { z } from "zod";

export const DatabaseIdSchema = z.number("Invalid database ID").int().positive().safe();

export const DatabaseIdsSchema = z.array(DatabaseIdSchema, "Invalid database IDs");

export const PlaybackPositionSchema = z.number().finite().nonnegative();

export const PlaylistDuplicatesSchema = z.enum(["allow", "skip", "reject"]);

export const SetTracksLikedInputSchema = z.object({
  liked: z.boolean("Invalid track like input"),
  trackIds: DatabaseIdsSchema.min(1).readonly(),
});
