"use server";

import { redirect } from "next/navigation";
import { actor, HttpError } from "../../lib/auth";
import { requestAccountState } from "../../lib/platform-admin";

export async function requestAccountChange(formData: FormData) {
  const userId = String(formData.get("user_id") || "");
  const desired = String(formData.get("desired_state") || "");
  const back = `/admin/users/${userId}`;
  if (formData.get("confirm") !== "CONFIRM")
    redirect(`${back}?error=${encodeURIComponent("Confirmation is required")}`);
  if (desired !== "ACTIVE" && desired !== "SUSPENDED")
    redirect(
      `${back}?error=${encodeURIComponent("Choose suspend or reactivate")}`,
    );
  try {
    await requestAccountState(
      await actor(),
      userId,
      desired,
      String(formData.get("reason") || ""),
    );
  } catch (error) {
    const message =
      error instanceof HttpError
        ? error.message
        : "The approval could not be requested";
    redirect(`${back}?error=${encodeURIComponent(message)}`);
  }
  redirect(`${back}?requested=1`);
}
