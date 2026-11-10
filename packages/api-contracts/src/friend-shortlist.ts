/**
 * Wire types for "Get a friend hired": a signed-in sender pastes a friend's
 * LinkedIn link and shares the friend's ten best matches, or shares their own
 * invite link. The friend never has an account here, so nothing on the wire
 * carries more of them than the first name on their profile.
 */

/** One matched job, as it was when the shortlist was built. */
export type FriendShortlistJob = {
  listingId: string;
  title: string;
  company: string;
  companyDomain: string | null;
  logoUrl: string | null;
  location: string | null;
  salary: string | null;
  /** Match score from 0 to 100. */
  score: number;
};

export type FriendShortlistStatus = "building" | "ready" | "failed";

/** What each side gets, in days of free plan time. */
export type FriendShortlistOffer = {
  friendFreeDays: number;
  senderFreeDays: number;
};

/**
 * The sender's view. `token` is null until the matches are ready to share.
 * `friendFirstName` is the first name on the LinkedIn profile, and is null
 * when that is not a plain name or the shortlist failed.
 */
export type FriendShortlist = {
  id: string;
  status: FriendShortlistStatus;
  friendFirstName: string | null;
  token: string | null;
  jobs: FriendShortlistJob[];
  offer: FriendShortlistOffer;
};

/** What a shared shortlist link shows. It never carries profile content. */
export type PublicFriendShortlist = {
  friendFirstName: string | null;
  senderFirstName: string | null;
  jobs: FriendShortlistJob[];
  friendFreeDays: number;
};

/** The sender's own link, for a friend whose LinkedIn they don't have. */
export type FriendInvite = {
  code: string;
  offer: FriendShortlistOffer;
};

/** What an invite link shows. */
export type PublicFriendInvite = {
  senderFirstName: string | null;
  friendFreeDays: number;
};

/** Why `POST /friend-shortlists` refused a link, as the `code` of its reply. */
export type FriendShortlistRefusalCode =
  | "LINKEDIN_URL_INVALID"
  | "LINKEDIN_PROFILE_NOT_FOUND"
  | "LINKEDIN_PROFILE_EMPTY"
  | "LINKEDIN_UNAVAILABLE";

export type FriendShortlistRefusal = {
  error: string;
  code: FriendShortlistRefusalCode;
};

export type FriendShortlistResponse = { shortlist: FriendShortlist };
export type PublicFriendShortlistResponse = { shortlist: PublicFriendShortlist };
export type FriendInviteResponse = { invite: FriendInvite };
export type PublicFriendInviteResponse = { invite: PublicFriendInvite };
