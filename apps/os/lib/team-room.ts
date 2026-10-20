import { z } from "zod";
import { query } from "../../../packages/db";
import { HttpError, type Actor } from "./auth";
const id = z.string().uuid();
export type TeamRoom = {
  id: string;
  org_id: string;
  project_id: string;
  name: string;
  guidelines: string;
  access: "PROJECT" | "PRIVATE";
  created_by: string;
};
export async function teamRoom(a: Actor, r: string) {
  const rows = await query<TeamRoom>(
    a,
    "select * from kxra.team_rooms where id=$1",
    [id.parse(r)],
  );
  if (!rows[0]) throw new HttpError(404, "Room unavailable");
  return rows[0];
}
