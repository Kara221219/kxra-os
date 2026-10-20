export type JourneyMedia = {
  video: string;
  poster: string;
  attribution: string;
};
// Enable only after a completed generation, media inspection and optimisation.
export const journeyMedia: JourneyMedia = {
  video: "/media/consultancy/industry-walkthrough-v2.mp4",
  poster: "/media/consultancy/industry-walkthrough-v2.jpg",
  attribution:
    "Original architectural visualisation generated with Seedance 2.5 via Higgsfield API; not KXRA premises.",
};
