import { z } from "zod";

/**
 * The product's pages, by name.
 *
 * A destination is a NAME rather than a path, so nothing in the system types a
 * URL: the browser owns the routing table and resolves the name against its
 * own allowlist (`OPEN_DESTINATIONS` in
 * `apps/web/src/lib/assistant/viewActions.ts`). The `open` action takes one of
 * these, and so does a handoff — the two have to agree, because a handoff's
 * whole promise is that the person was taken somewhere `open` can take them.
 */
export const openDestinationSchema = z.enum([
  "matches",
  "browse",
  "applications",
  "messages",
  "profile",
  "billing",
  "help",
  "feedback",
  "job",
  "pack",
]);

export type OpenDestination = z.infer<typeof openDestinationSchema>;

/**
 * The values a destination needs, as the browser's own query allowlist reads
 * them: `job` and `pack` each take a `listingId`; `profile` takes `section`
 * and, on the About section, `field`; `messages` takes `thread`, though
 * `open_thread` is the action that names one. A key the app does not read is
 * dropped rather than carried, so a param invented here changes nothing.
 */
export const openParamsSchema = z.record(z.string(), z.string());
