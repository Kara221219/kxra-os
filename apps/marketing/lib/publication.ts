import snapshot from "../content/publication-v1.json";

if (snapshot.publicationEnabled) {
  throw new Error(
    "Public publication cannot be enabled from application source",
  );
}

export const publication = Object.freeze(snapshot);
